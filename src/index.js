import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

// ============ CONSTANTS ============
const WORKING_DAYS_DEFAULT = 10;
const HOURS_PER_DAY = 8;

// ============ HELPER FUNCTIONS ============

const isWorkingDay = (date) => {
  const day = new Date(date).getDay();
  return day !== 0 && day !== 6;
};

const countWorkingDays = (startDate, endDate) => {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    if (isWorkingDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count || WORKING_DAYS_DEFAULT;
};

const secondsToHours = (seconds) => {
  if (!seconds) return 0;
  return Math.round((seconds / 3600) * 10) / 10;
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

// ============ JIRA API CALLS (UPDATED TO AS_APP) ============

const getBoards = async () => {
  try {
    // FIX: Dùng asApp() để không hỏi quyền người xem
    const response = await api.asApp().requestJira(
      route`/rest/agile/1.0/board?type=scrum&maxResults=50`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      console.error(`[getBoards] Error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.values || [];
  } catch (err) {
    console.error('[getBoards] Exception:', err);
    return [];
  }
};

const getActiveSprint = async (boardId) => {
  if (!boardId) return null;
  try {
    // FIX: Dùng asApp()
    const response = await api.asApp().requestJira(
      route`/rest/agile/1.0/board/${boardId}/sprint?state=active`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.values?.[0] || null;
  } catch (err) {
    console.error('[getActiveSprint] Exception:', err);
    return null;
  }
};

// === FIX: Dùng POST /rest/api/3/search/jql & asApp() ===
const getSprintIssues = async (sprintId) => {
  if (!sprintId) return [];

  const jql = `sprint = ${sprintId}`;
  let allIssues = [];
  let nextPageToken = null;

  try {
    do {
      const requestBody = {
        jql: jql,
        fields: [
          'summary', 'status', 'priority', 'assignee',
          'timeoriginalestimate', 'timeestimate', 'timespent',
          'duedate', 'created', 'updated', 'issuetype', 'fixVersions'
        ],
        maxResults: 100
      };

      if (nextPageToken) {
        requestBody.nextPageToken = nextPageToken;
      }

      // FIX: Dùng asApp()
      const response = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[getSprintIssues] Failed: ${response.status} - ${errText}`);
        throw new Error(`Failed to fetch issues: ${response.status}`);
      }

      const data = await response.json();
      const issues = data.issues || [];
      allIssues = allIssues.concat(issues);

      nextPageToken = data.nextPageToken || null;
    } while (nextPageToken);

    return allIssues;
  } catch (err) {
    console.error('[getSprintIssues] Exception:', err);
    return allIssues.length > 0 ? allIssues : [];
  }
};

// ============ BASELINE FUNCTIONS ============

const getSprintBaseline = async (sprintId) => {
  try {
    const baseline = await storage.get(`baseline-${sprintId}`);
    return baseline || null;
  } catch (error) {
    console.error('Error getting baseline:', error);
    return null;
  }
};

const saveSprintBaseline = async (sprintId, issues) => {
  try {
    const baseline = issues.map(issue => ({
      key: issue.key,
      priority: issue.fields.priority?.name,
      originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
      addedAt: issue.fields.created
    }));

    await storage.set(`baseline-${sprintId}`, {
      sprintId,
      issues: baseline,
      capturedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Error saving baseline:', error);
    return false;
  }
};

const saveDailySnapshot = async (sprintId, dateStr, snapshotData) => {
  try {
    await storage.set(`snapshot-${sprintId}-${dateStr}`, snapshotData);
    return true;
  } catch (error) {
    console.error('Error saving daily snapshot:', error);
    return false;
  }
};

const getDailySnapshot = async (sprintId, dateStr) => {
  try {
    const snapshot = await storage.get(`snapshot-${sprintId}-${dateStr}`);
    return snapshot || null;
  } catch (error) {
    console.error('Error getting daily snapshot:', error);
    return null;
  }
};

// ============ RESOLVERS ============

resolver.define('getBoards', async () => {
  try {
    const boards = await getBoards();
    return {
      success: true,
      boards: boards.map(b => ({
        id: b.id,
        name: b.name,
        projectKey: b.location?.projectKey
      }))
    };
  } catch (error) {
    console.error('Error fetching boards:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getConfig', async ({ context }) => {
  try {
    const gadgetId = context.extension?.gadget?.id || context.extension?.id || 'default';
    const config = await storage.get(`config-${gadgetId}`);
    return config || { boardId: null, teamSize: 10, workingDays: 10 };
  } catch (error) {
    console.error('Error getting config:', error);
    return { boardId: null, teamSize: 10, workingDays: 10 };
  }
});

resolver.define('saveConfig', async ({ payload, context }) => {
  try {
    const gadgetId = context.extension?.gadget?.id || context.extension?.id || 'default';
    await storage.set(`config-${gadgetId}`, payload);
    return { success: true };
  } catch (error) {
    console.error('Error saving config:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getBurndownData', async ({ payload }) => {
  try {
    const { boardId, assignee, teamSize: configTeamSize } = payload;

    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let allIssues = await getSprintIssues(sprint.id);

    let baseline = await getSprintBaseline(sprint.id);
    if (!baseline) {
      await saveSprintBaseline(sprint.id, allIssues);
      baseline = await getSprintBaseline(sprint.id);
    }

    const allAssignees = [...new Set(
      allIssues.map(i => i.fields.assignee?.displayName).filter(Boolean)
    )];

    let issues = allIssues;
    let teamSize = configTeamSize || allAssignees.length || 1;

    if (assignee && assignee !== 'All') {
      issues = issues.filter(i =>
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
      teamSize = 1;

      if (baseline?.issues) {
        baseline = {
          ...baseline,
          issues: baseline.issues.filter(b => {
            const fullIssue = allIssues.find(i => i.key === b.key);
            return fullIssue?.fields.assignee?.displayName === assignee ||
                   fullIssue?.fields.assignee?.accountId === assignee;
          })
        };
      }
    }

    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const workingDays = countWorkingDays(startDate, endDate);

    const totalOriginalEstimate = baseline?.issues?.reduce((sum, item) =>
      sum + (item.originalEstimate || 0), 0
    ) || issues.reduce((sum, issue) =>
      sum + secondsToHours(issue.fields.timeoriginalestimate), 0
    );

    const currentRemaining = issues.reduce((sum, issue) =>
      sum + secondsToHours(issue.fields.timeestimate), 0
    );

    const totalSpent = issues.reduce((sum, issue) =>
      sum + secondsToHours(issue.fields.timespent), 0
    );

    const baselineKeys = new Set(baseline?.issues?.map(i => i.key) || []);
    const currentKeys = new Set(issues.map(i => i.key));

    const addedIssues = issues.filter(i => !baselineKeys.has(i.key));
    const removedIssues = baseline?.issues?.filter(b => !currentKeys.has(b.key)) || [];

    const scopeAddedTotal = addedIssues.reduce((sum, issue) =>
      sum + secondsToHours(issue.fields.timeoriginalestimate), 0
    );

    const scopeRemovedTotal = removedIssues.reduce((sum, item) =>
      sum + (item.originalEstimate || 0), 0
    );

    const scopeChangesByDate = {};
    addedIssues.forEach(issue => {
      const addedDate = new Date(issue.fields.created).toISOString().split('T')[0];
      if (!scopeChangesByDate[addedDate]) {
        scopeChangesByDate[addedDate] = { added: 0, removed: 0 };
      }
      scopeChangesByDate[addedDate].added += secondsToHours(issue.fields.timeoriginalestimate);
    });

    const todayStr = new Date().toISOString().split('T')[0];
    await saveDailySnapshot(sprint.id, todayStr, {
      remaining: Math.round(currentRemaining * 10) / 10,
      timeLogged: Math.round(totalSpent * 10) / 10,
      issueCount: issues.length,
      capturedAt: new Date().toISOString()
    });

    const dataPoints = [];
    const current = new Date(startDate);
    let workingDayCount = 0;
    const dailyDecrease = totalOriginalEstimate / workingDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      if (isWorkingDay(current) && current > startDate) {
        workingDayCount++;
      }

      const ideal = Math.max(0, totalOriginalEstimate - (dailyDecrease * workingDayCount));
      const dateStr = current.toISOString().split('T')[0];
      const currentDate = new Date(current);
      currentDate.setHours(0, 0, 0, 0);
      const isPastOrToday = currentDate <= today;
      const scopeChange = scopeChangesByDate[dateStr] || { added: 0, removed: 0 };

      if (isPastOrToday) {
        const snapshot = await getDailySnapshot(sprint.id, dateStr);

        if (snapshot) {
          dataPoints.push({
            date: dateStr,
            displayDate: formatDate(dateStr),
            ideal: Math.round(ideal * 10) / 10,
            remaining: snapshot.remaining,
            timeLogged: snapshot.timeLogged,
            added: scopeChange.added > 0 ? Math.round(scopeChange.added * 10) / 10 : 0,
            removed: scopeChange.removed > 0 ? -Math.round(scopeChange.removed * 10) / 10 : 0
          });
        } else {
          const totalDaysElapsed = countWorkingDays(startDate, today);
          const daysElapsedToHere = countWorkingDays(startDate, currentDate);
          let estimatedRemaining;
          let estimatedTimeLogged;

          if (totalDaysElapsed <= 1) {
            estimatedRemaining = totalOriginalEstimate;
            estimatedTimeLogged = 0;
          } else {
            const progress = daysElapsedToHere / totalDaysElapsed;
            estimatedRemaining = totalOriginalEstimate - (totalOriginalEstimate - currentRemaining) * progress;
            estimatedTimeLogged = totalSpent * progress;
          }

          dataPoints.push({
            date: dateStr,
            displayDate: formatDate(dateStr),
            ideal: Math.round(ideal * 10) / 10,
            remaining: Math.round(estimatedRemaining * 10) / 10,
            timeLogged: Math.round(estimatedTimeLogged * 10) / 10,
            added: scopeChange.added > 0 ? Math.round(scopeChange.added * 10) / 10 : 0,
            removed: scopeChange.removed > 0 ? -Math.round(scopeChange.removed * 10) / 10 : 0
          });
        }
      } else {
        dataPoints.push({
          date: dateStr,
          displayDate: formatDate(dateStr),
          ideal: Math.round(ideal * 10) / 10,
          remaining: null,
          timeLogged: null,
          added: 0,
          removed: 0
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return {
      success: true,
      data: {
        dataPoints,
        sprintName: sprint.name,
        sprintId: sprint.id,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        totalOriginalEstimate: Math.round(totalOriginalEstimate * 10) / 10,
        currentRemaining: Math.round(currentRemaining * 10) / 10,
        totalSpent: Math.round(totalSpent * 10) / 10,
        scopeAddedTotal: Math.round(scopeAddedTotal * 10) / 10,
        scopeRemovedTotal: Math.round(scopeRemovedTotal * 10) / 10,
        workingDays,
        teamSize,
        assignees: allAssignees,
        addedIssuesCount: addedIssues.length,
        removedIssuesCount: removedIssues.length
      }
    };
  } catch (error) {
    console.error('Error in getBurndownData:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getSprintHealth', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let issues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }

    let underCount = 0, normalCount = 0, goodCount = 0;
    const details = [];

    issues.forEach(issue => {
      const original = secondsToHours(issue.fields.timeoriginalestimate);
      const spent = secondsToHours(issue.fields.timespent);
      const remaining = secondsToHours(issue.fields.timeestimate);
      const actualTotal = spent + remaining;
      const variance = actualTotal - original;

      let status;
      if (original === 0) {
         status = 'normal'; normalCount++;
      } else if (original < actualTotal) {
         status = 'underestimated'; underCount++;
      } else if (original > actualTotal) {
         status = 'good'; goodCount++;
      } else {
         status = 'normal'; normalCount++;
      }

      details.push({
        key: issue.key,
        summary: issue.fields.summary,
        status, original, spent, remaining,
        variance: Math.round(variance * 10) / 10
      });
    });

    return {
      success: true,
      data: {
        counts: { under: underCount, normal: normalCount, good: goodCount, total: issues.length },
        details, sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getSprintHealth:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getAtRiskItems', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let issues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }

    const atRiskItems = [];
    const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    issues.forEach(issue => {
      const status = issue.fields.status?.name?.toLowerCase() || '';
      if (doneStatuses.some(s => status.includes(s))) return;

      let riskReason = null;
      const remaining = secondsToHours(issue.fields.timeestimate);
      const original = secondsToHours(issue.fields.timeoriginalestimate);
      const dueDate = issue.fields.duedate ? new Date(issue.fields.duedate) : null;

      if (remaining === 0 && original > 0) riskReason = 'TIME_BOX_EXCEEDED';
      if (dueDate) {
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate <= now) riskReason = 'DEADLINE_EXCEEDED';
      }

      if (riskReason) {
        atRiskItems.push({
          key: issue.key,
          summary: issue.fields.summary,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          assigneeAvatar: issue.fields.assignee?.avatarUrls?.['24x24'],
          priority: issue.fields.priority?.name || 'Medium',
          status: issue.fields.status?.name || 'To Do',
          dueDate: issue.fields.duedate,
          originalEstimate: original, remainingEstimate: remaining, riskReason
        });
      }
    });

    const priorityOrder = { 'Highest': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Lowest': 5 };
    atRiskItems.sort((a, b) => {
      const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
      if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });

    return {
      success: true,
      data: { items: atRiskItems, total: atRiskItems.length, sprintName: sprint.name }
    };
  } catch (error) {
    console.error('Error in getAtRiskItems:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getScopeChanges', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let allIssues = await getSprintIssues(sprint.id);

    let baseline = await getSprintBaseline(sprint.id);
    if (!baseline) {
      await saveSprintBaseline(sprint.id, allIssues);
      baseline = await getSprintBaseline(sprint.id);
    }

    let issues = allIssues;
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }

    const baselineKeys = new Set(baseline?.issues?.map(i => i.key) || []);
    const currentKeys = new Set(issues.map(i => i.key));

    const added = issues
      .filter(i => !baselineKeys.has(i.key))
      .map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        assigneeAvatar: issue.fields.assignee?.avatarUrls?.['24x24'],
        priority: issue.fields.priority?.name,
        status: issue.fields.status?.name,
        changeType: 'ADDED',
        changeDate: issue.fields.created,
        originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
        remainingEstimate: secondsToHours(issue.fields.timeestimate)
      }));

    const removed = (baseline?.issues || [])
      .filter(b => !currentKeys.has(b.key))
      .map(b => ({
        key: b.key,
        summary: b.key,
        changeType: 'REMOVED',
        originalEstimate: b.originalEstimate || 0
      }));

    return {
      success: true,
      data: {
        added, removed, priorityChanged: [],
        totalAdded: added.length, totalRemoved: removed.length, totalPriorityChanged: 0,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getScopeChanges:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getHighPriorityItems', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let issues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }

    const highPriorityItems = issues
      .filter(issue => {
        const priority = issue.fields.priority?.name?.toLowerCase();
        return priority === 'highest' || priority === 'high';
      })
      .map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        assigneeAvatar: issue.fields.assignee?.avatarUrls?.['24x24'],
        priority: issue.fields.priority?.name,
        status: issue.fields.status?.name,
        dueDate: issue.fields.duedate,
        originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
        remainingEstimate: secondsToHours(issue.fields.timeestimate),
        timeSpent: secondsToHours(issue.fields.timespent)
      }));

    const doneStatuses = ['done', 'closed', 'resolved'];
    highPriorityItems.sort((a, b) => {
      const pA = a.priority === 'Highest' ? 1 : 2;
      const pB = b.priority === 'Highest' ? 1 : 2;
      if (pA !== pB) return pA - pB;

      const aIsDone = doneStatuses.some(s => a.status?.toLowerCase().includes(s));
      const bIsDone = doneStatuses.some(s => b.status?.toLowerCase().includes(s));
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;

      const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
      return dateA - dateB;
    });

    return {
      success: true,
      data: {
        items: highPriorityItems,
        total: highPriorityItems.length,
        highestCount: highPriorityItems.filter(i => i.priority === 'Highest').length,
        highCount: highPriorityItems.filter(i => i.priority === 'High').length,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getHighPriorityItems:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('getReleaseData', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let issues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }

    const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
    const releaseMap = new Map();

    issues.forEach(issue => {
      const versions = issue.fields.fixVersions || [];
      versions.forEach(version => {
        if (!releaseMap.has(version.id)) {
          releaseMap.set(version.id, {
            id: version.id, name: version.name,
            description: version.description || '',
            releaseDate: version.releaseDate || null,
            released: version.released || false,
            totalIssues: 0, doneIssues: 0,
            totalEstimate: 0, doneEstimate: 0,
            issues: []
          });
        }
        const release = releaseMap.get(version.id);
        const status = issue.fields.status?.name?.toLowerCase() || '';
        const isDone = doneStatuses.some(s => status.includes(s));
        const estimate = secondsToHours(issue.fields.timeoriginalestimate);
        release.totalIssues++;
        release.totalEstimate += estimate;
        if (isDone) { release.doneIssues++; release.doneEstimate += estimate; }
        release.issues.push({
          key: issue.key, summary: issue.fields.summary,
          status: issue.fields.status?.name,
          priority: issue.fields.priority?.name,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          isDone, estimate
        });
      });
    });

    const releases = Array.from(releaseMap.values()).map(r => ({
      ...r,
      progress: r.totalIssues > 0 ? Math.round((r.doneIssues / r.totalIssues) * 100) : 0,
      totalEstimate: Math.round(r.totalEstimate * 10) / 10,
      doneEstimate: Math.round(r.doneEstimate * 10) / 10
    }));

    releases.sort((a, b) => {
      if (a.released !== b.released) return a.released ? 1 : -1;
      const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date('9999-12-31');
      const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date('9999-12-31');
      return dateA - dateB;
    });

    const unversionedCount = issues.filter(
      issue => !issue.fields.fixVersions || issue.fields.fixVersions.length === 0
    ).length;

    return {
      success: true,
      data: { releases, totalReleases: releases.length, unversionedCount, sprintName: sprint.name }
    };
  } catch (error) {
    console.error('Error in getReleaseData:', error);
    return { success: false, error: error.message };
  }
});

resolver.define('resetBaseline', async ({ payload }) => {
  try {
    const { boardId } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    const issues = await getSprintIssues(sprint.id);
    await saveSprintBaseline(sprint.id, issues);

    return {
      success: true,
      message: 'Baseline reset successfully',
      issuesCount: issues.length
    };
  } catch (error) {
    console.error('Error resetting baseline:', error);
    return { success: false, error: error.message };
  }
});

export const handler = resolver.getDefinitions();