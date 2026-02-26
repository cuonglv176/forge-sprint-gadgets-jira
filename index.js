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

// ============ JIRA API CALLS ============
const getBoards = async () => {
  const response = await api.asUser().requestJira(
    route`/rest/agile/1.0/board?type=scrum&maxResults=50`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!response.ok) throw new Error(`Failed to fetch boards: ${response.status}`);
  const data = await response.json();
  return data.values || [];
};

const getActiveSprint = async (boardId) => {
  const response = await api.asUser().requestJira(
    route`/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.values?.[0] || null;
};

const getSprintIssues = async (sprintId) => {
  const jql = `sprint = ${sprintId}`;
  let allIssues = [];
  let nextPageToken = null;

  do {
    const requestBody = {
      jql: jql,
      fields: [
        'summary', 'status', 'priority', 'assignee', 'issuetype',
        'timeoriginalestimate', 'timeestimate', 'timespent',
        'duedate', 'created', 'updated', 'fixVersions'
      ],
      maxResults: 100
    };

    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    const response = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error(`Failed to fetch issues: ${response.status}`);
    const data = await response.json();
    allIssues = allIssues.concat(data.issues || []);
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  return allIssues;
};

// ============ RESOLVERS ============
resolver.define('getBoards', async () => {
  try {
    const boards = await getBoards();
    return { success: true, boards: boards.map(b => ({ id: b.id, name: b.name, projectKey: b.location?.projectKey })) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

resolver.define('getConfig', async ({ context }) => {
  try {
    const gadgetId = context.extension?.gadget?.id || 'default';
    const config = await storage.get(`config-${gadgetId}`);
    return config || { boardId: null, teamSize: 10, workingDays: 10 };
  } catch (error) {
    return { boardId: null, teamSize: 10, workingDays: 10 };
  }
});

resolver.define('saveConfig', async ({ payload, context }) => {
  try {
    const gadgetId = context.extension?.gadget?.id || 'default';
    await storage.set(`config-${gadgetId}`, payload);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ BASELINE STORAGE ============
const getSprintBaseline = async (sprintId) => {
  try {
    return await storage.get(`baseline-${sprintId}`);
  } catch (e) {
    return null;
  }
};

const saveSprintBaseline = async (sprintId, issues) => {
  const baseline = {
    sprintId,
    createdAt: new Date().toISOString(),
    issues: issues.map(i => ({
      key: i.key,
      originalEstimate: secondsToHours(i.fields.timeoriginalestimate),
      assignee: i.fields.assignee?.displayName || null
    }))
  };
  await storage.set(`baseline-${sprintId}`, baseline);
  return baseline;
};

resolver.define('getBurndownData', async ({ payload }) => {
  try {
    const { boardId, assignee, teamSize: configTeamSize } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };
    
    let allIssues = await getSprintIssues(sprint.id);
    
    // Get or create baseline
    let baseline = await getSprintBaseline(sprint.id);
    if (!baseline) {
      baseline = await saveSprintBaseline(sprint.id, allIssues);
    }
    
    const allAssignees = [...new Set(allIssues.map(i => i.fields.assignee?.displayName).filter(Boolean))];
    
    // Filter by assignee if specified
    let issues = allIssues;
    let teamSize = configTeamSize || allAssignees.length || 1;
    let filteredBaseline = baseline;
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
      teamSize = 1;
      
      // Also filter baseline for this assignee
      if (filteredBaseline?.issues) {
        filteredBaseline = {
          ...baseline,
          issues: baseline.issues.filter(b => b.assignee === assignee)
        };
      }
    }
    
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const workingDays = countWorkingDays(startDate, endDate);
    
    // Max Capacity = workingDays × 8h × teamSize
    const maxCapacity = workingDays * HOURS_PER_DAY * teamSize;
    
    // Original Estimate from baseline
    const totalOriginalEstimate = filteredBaseline?.issues?.reduce((sum, item) => 
      sum + (item.originalEstimate || 0), 0
    ) || issues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timeoriginalestimate), 0
    );
    
    // Current metrics
    const currentRemaining = issues.reduce((sum, issue) => sum + secondsToHours(issue.fields.timeestimate), 0);
    const totalSpent = issues.reduce((sum, issue) => sum + secondsToHours(issue.fields.timespent), 0);
    
    // Identify scope changes
    const baselineKeys = new Set(filteredBaseline?.issues?.map(i => i.key) || []);
    const currentKeys = new Set(issues.map(i => i.key));
    
    const addedIssues = issues.filter(i => {
      const created = new Date(i.fields.created);
      return created > startDate && !baselineKeys.has(i.key);
    });
    
    const removedIssues = filteredBaseline?.issues?.filter(b => !currentKeys.has(b.key)) || [];
    
    const scopeAddedTotal = addedIssues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timeoriginalestimate), 0
    );
    
    const scopeRemovedTotal = removedIssues.reduce((sum, item) => 
      sum + (item.originalEstimate || 0), 0
    );
    
    // Generate data points
    const dataPoints = [];
    const current = new Date(startDate);
    let workingDayCount = 0;
    const dailyDecrease = maxCapacity / workingDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Track scope changes by date
    const scopeChangesByDate = {};
    
    // Track added issues by creation date
    addedIssues.forEach(issue => {
      const addedDate = new Date(issue.fields.created).toISOString().split('T')[0];
      if (!scopeChangesByDate[addedDate]) {
        scopeChangesByDate[addedDate] = { added: 0, removed: 0 };
      }
      scopeChangesByDate[addedDate].added += secondsToHours(issue.fields.timeoriginalestimate);
    });
    
    // Track removed issues - assign to today's date
    if (removedIssues.length > 0) {
      const removedDate = today <= endDate 
        ? today.toISOString().split('T')[0]
        : endDate.toISOString().split('T')[0];
      if (!scopeChangesByDate[removedDate]) {
        scopeChangesByDate[removedDate] = { added: 0, removed: 0 };
      }
      removedIssues.forEach(item => {
        scopeChangesByDate[removedDate].removed += (item.originalEstimate || 0);
      });
    }
    
    // Generate data points for ALL calendar days (including weekends)
    while (current <= endDate) {
      if (isWorkingDay(current) && current > startDate) {
        workingDayCount++;
      }
      
      // Ideal: from maxCapacity decreasing linearly to 0
      const ideal = Math.max(0, maxCapacity - (dailyDecrease * workingDayCount));
      
      const dateStr = current.toISOString().split('T')[0];
      const currentDate = new Date(current);
      currentDate.setHours(0, 0, 0, 0);
      const isPastOrToday = currentDate <= today;
      
      // Scope changes for this date
      const scopeChange = scopeChangesByDate[dateStr] || { added: 0, removed: 0 };
      
      dataPoints.push({
        date: dateStr,
        displayDate: formatDate(dateStr),
        ideal: Math.round(ideal * 10) / 10,
        remaining: isPastOrToday ? Math.round(currentRemaining * 10) / 10 : null,
        timeLogged: isPastOrToday ? Math.round(totalSpent * 10) / 10 : null,
        added: scopeChange.added > 0 ? Math.round(scopeChange.added * 10) / 10 : 0,
        removed: scopeChange.removed > 0 ? -Math.round(scopeChange.removed * 10) / 10 : 0
      });
      current.setDate(current.getDate() + 1);
    }
    
    return {
      success: true,
      data: {
        dataPoints,
        sprintName: sprint.name,
        sprintStartDate: sprint.startDate,
        sprintEndDate: sprint.endDate,
        maxCapacity: Math.round(maxCapacity * 10) / 10,
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
    issues.forEach(issue => {
      const original = secondsToHours(issue.fields.timeoriginalestimate);
      const spent = secondsToHours(issue.fields.timespent);
      const remaining = secondsToHours(issue.fields.timeestimate);
      const actualTotal = spent + remaining;
      if (original < actualTotal) underCount++;
      else if (original > actualTotal) goodCount++;
      else normalCount++;
    });
    
    return {
      success: true,
      data: { counts: { under: underCount, normal: normalCount, good: goodCount, total: issues.length }, sprintName: sprint.name }
    };
  } catch (error) {
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
          key: issue.key, summary: issue.fields.summary,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          priority: issue.fields.priority?.name || 'Medium',
          status: issue.fields.status?.name || 'To Do',
          originalEstimate: original, remainingEstimate: remaining, riskReason
        });
      }
    });
    
    return { success: true, data: { items: atRiskItems, total: atRiskItems.length, sprintName: sprint.name } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

resolver.define('getScopeChanges', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };
    
    let issues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }
    
    const sprintStart = new Date(sprint.startDate);
    const added = [];
    
    issues.forEach(issue => {
      const created = new Date(issue.fields.created);
      if (created > sprintStart) {
        added.push({
          key: issue.key, summary: issue.fields.summary,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          priority: issue.fields.priority?.name,
          status: issue.fields.status?.name,
          changeType: 'ADDED',
          originalEstimate: secondsToHours(issue.fields.timeoriginalestimate)
        });
      }
    });
    
    return {
      success: true,
      data: { added, removed: [], priorityChanged: [], totalAdded: added.length, totalRemoved: 0, totalPriorityChanged: 0, sprintName: sprint.name }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

resolver.define('getHighPriorityItems', async ({ payload }) => {
  try {
    const { boardId, assignee, expand } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };
    
    let issues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
    }
    
    const priorityOrder = { 'Highest': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Lowest': 5 };
    const doneStatuses = ['done', 'closed', 'resolved'];
    
    const allItems = issues.map(issue => ({
      key: issue.key, summary: issue.fields.summary,
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      priority: issue.fields.priority?.name || 'Medium',
      status: issue.fields.status?.name,
      dueDate: issue.fields.duedate,
      originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
      remainingEstimate: secondsToHours(issue.fields.timeestimate),
      timeSpent: secondsToHours(issue.fields.timespent)
    }));
    
    allItems.sort((a, b) => {
      const pA = priorityOrder[a.priority] || 3;
      const pB = priorityOrder[b.priority] || 3;
      if (pA !== pB) return pA - pB;
      const aIsDone = doneStatuses.some(s => a.status?.toLowerCase().includes(s));
      const bIsDone = doneStatuses.some(s => b.status?.toLowerCase().includes(s));
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
      const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
      return dateA - dateB;
    });
    
    const displayItems = expand ? allItems : allItems.slice(0, 5);
    
    return {
      success: true,
      data: {
        items: displayItems, total: allItems.length,
        highestCount: allItems.filter(i => i.priority === 'Highest').length,
        highCount: allItems.filter(i => i.priority === 'High').length,
        mediumCount: allItems.filter(i => i.priority === 'Medium').length,
        lowCount: allItems.filter(i => i.priority === 'Low').length,
        lowestCount: allItems.filter(i => i.priority === 'Lowest').length,
        sprintName: sprint.name,
        isExpanded: !!expand
      }
    };
  } catch (error) {
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
    return { success: false, error: error.message };
  }
});

export const handler = resolver.getDefinitions();
