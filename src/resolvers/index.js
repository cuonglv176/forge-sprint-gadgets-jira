import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

// ============ CONSTANTS ============
const WORKING_DAYS_DEFAULT = 10;
const HOURS_PER_DAY = 8;
const JIRA_BASE_URL = 'https://jeisysvn.atlassian.net';

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

// Status sorting helper: In Progress -> To Do -> Done
const STATUS_ORDER = {
  'in progress': 1, 'in progress - main task': 1,
  'to do': 2, 'open': 2, 'backlog': 2, 'hold': 2,
  'done': 3, 'closed': 3, 'resolved': 3, 'complete': 3
};

const getStatusOrder = (statusName) => {
  const lower = (statusName || '').toLowerCase();
  for (const [key, order] of Object.entries(STATUS_ORDER)) {
    if (lower.includes(key)) return order;
  }
  return 2;
};

const sortByStatus = (items, statusField = 'status') => {
  return items.sort((a, b) => {
    const orderA = getStatusOrder(a[statusField]);
    const orderB = getStatusOrder(b[statusField]);
    return orderA - orderB;
  });
};

// ============ SUBTASK LOGIC ============
// Detect if an issue is a parent task that has subtasks
// Uses TWO methods:
// 1. issue.fields.subtasks - Jira's own subtask list (always available, even if subtasks not in sprint)
// 2. issue.fields.issuetype check - for subtask detection in the filtered list
const isParentWithSubtasks = (issue) => {
  // Check Jira's subtasks field (most reliable - shows ALL subtasks regardless of sprint/filter)
  if (issue.fields.subtasks && issue.fields.subtasks.length > 0) return true;
  // Check issue type name for "Main Task" pattern
  const typeName = (issue.fields.issuetype?.name || '').toLowerCase();
  if (typeName.includes('main task')) return true;
  return false;
};

const isSubtaskIssue = (issue) => {
  return issue.fields.issuetype?.subtask === true
    || (issue.fields.issuetype?.name || '').toLowerCase().includes('sub-task')
    || (issue.fields.issuetype?.name || '').toLowerCase().includes('subtask');
};

// Build subtask relationship map from issues list
const buildSubtaskMap = (issues) => {
  const subtasksByParent = {};
  const subtaskKeys = new Set();
  const parentKeys = new Set();

  // Method 1: Detect subtasks in the list by their issuetype
  issues.forEach(issue => {
    if (isSubtaskIssue(issue) && issue.fields.parent?.key) {
      const parentKey = issue.fields.parent.key;
      if (!subtasksByParent[parentKey]) subtasksByParent[parentKey] = [];
      subtasksByParent[parentKey].push(issue);
      subtaskKeys.add(issue.key);
      parentKeys.add(parentKey);
    }
  });

  // Method 2: Also mark parents that have subtasks via fields.subtasks
  // Even if their subtasks are NOT in the filtered list
  issues.forEach(issue => {
    if (isParentWithSubtasks(issue)) {
      parentKeys.add(issue.key);
    }
  });

  return { subtasksByParent, subtaskKeys, parentKeys };
};

// CORE LOGIC for computing effective values:
// - If issue is a subtask → skip (will be counted via parent or already counted)
// - If issue is a parent WITH subtasks in the filtered list → use sum of those subtasks only
// - If issue is a parent WITHOUT subtasks in the filtered list → SKIP entirely
//   (because Jira's timeestimate on parent = aggregated sum of ALL subtasks,
//    which includes subtasks assigned to other people → would be wrong for per-person filter)
// - If issue is a regular task (no subtasks) → use its own value
const computeEffectiveRemaining = (issues) => {
  const { subtasksByParent, subtaskKeys, parentKeys } = buildSubtaskMap(issues);

  let totalRemaining = 0;
  issues.forEach(issue => {
    if (subtaskKeys.has(issue.key)) return; // Skip subtasks - counted via parent

    if (parentKeys.has(issue.key)) {
      // This is a parent task
      if (subtasksByParent[issue.key] && subtasksByParent[issue.key].length > 0) {
        // Has subtasks in filtered list → sum their values
        const subtaskRemaining = subtasksByParent[issue.key].reduce((sum, sub) =>
          sum + secondsToHours(sub.fields.timeestimate), 0
        );
        totalRemaining += subtaskRemaining;
      }
      // else: parent has subtasks but NONE are in filtered list → SKIP
      // (parent's timeestimate = all subtasks including other assignees → wrong for filter)
    } else {
      // Regular task (no subtasks) → use its own value
      totalRemaining += secondsToHours(issue.fields.timeestimate);
    }
  });

  return totalRemaining;
};

const computeEffectiveOriginalEstimate = (issues) => {
  const { subtasksByParent, subtaskKeys, parentKeys } = buildSubtaskMap(issues);

  let totalOE = 0;
  issues.forEach(issue => {
    if (subtaskKeys.has(issue.key)) return;

    if (parentKeys.has(issue.key)) {
      if (subtasksByParent[issue.key] && subtasksByParent[issue.key].length > 0) {
        const subtaskOE = subtasksByParent[issue.key].reduce((sum, sub) =>
          sum + secondsToHours(sub.fields.timeoriginalestimate), 0
        );
        totalOE += subtaskOE;
      }
      // else: skip parent with no subtasks in list
    } else {
      totalOE += secondsToHours(issue.fields.timeoriginalestimate);
    }
  });

  return totalOE;
};

const computeEffectiveSpent = (issues) => {
  const { subtasksByParent, subtaskKeys, parentKeys } = buildSubtaskMap(issues);

  let totalSpent = 0;
  issues.forEach(issue => {
    if (subtaskKeys.has(issue.key)) return;

    if (parentKeys.has(issue.key)) {
      if (subtasksByParent[issue.key] && subtasksByParent[issue.key].length > 0) {
        const subtaskSpent = subtasksByParent[issue.key].reduce((sum, sub) =>
          sum + secondsToHours(sub.fields.timespent), 0
        );
        totalSpent += subtaskSpent;
      }
      // else: skip parent with no subtasks in list
    } else {
      totalSpent += secondsToHours(issue.fields.timespent);
    }
  });

  return totalSpent;
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
        'duedate', 'created', 'updated', 'fixVersions', 'parent', 'subtasks'
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

// FIX v2: Query removed issues - use multiple approaches with proper JQL encoding
const getRemovedFromSprintIssues = async (sprintId, sprintName) => {
  const fields = 'summary,status,priority,assignee,issuetype,timeoriginalestimate,timeestimate,timespent,created,updated,parent,subtasks';
  const fieldsArray = fields.split(',');

  try {
    // Method 1: JQL with sprint ID via v2 search endpoint (more compatible)
    try {
      const jqlStr = `sprint was ${sprintId} AND sprint != ${sprintId}`;
      console.log(`[getRemovedFromSprintIssues] Method 1: JQL v2 GET with ID: ${jqlStr}`);
      const response = await api.asUser().requestJira(
        route`/rest/api/2/search?jql=${jqlStr}&fields=${fields}&maxResults=100`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        const issues = data.issues || [];
        console.log(`[getRemovedFromSprintIssues] Method 1 found ${issues.length} issues`);
        if (issues.length > 0) return issues;
      } else {
        const errText = await response.text();
        console.log(`[getRemovedFromSprintIssues] Method 1 failed: ${response.status} - ${errText.substring(0, 200)}`);
      }
    } catch (e1) {
      console.log(`[getRemovedFromSprintIssues] Method 1 error: ${e1.message}`);
    }

    // Method 2: JQL with sprint name via v3 POST endpoint
    if (sprintName) {
      try {
        const jqlStr2 = `sprint was "${sprintName}" AND sprint != "${sprintName}"`;
        console.log(`[getRemovedFromSprintIssues] Method 2: JQL v3 POST with name: ${jqlStr2}`);
        const requestBody = {
          jql: jqlStr2,
          fields: fieldsArray,
          maxResults: 100
        };

        const response2 = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (response2.ok) {
          const data2 = await response2.json();
          const issues2 = data2.issues || [];
          console.log(`[getRemovedFromSprintIssues] Method 2 found ${issues2.length} issues`);
          if (issues2.length > 0) return issues2;
        } else {
          const errText2 = await response2.text();
          console.log(`[getRemovedFromSprintIssues] Method 2 failed: ${response2.status} - ${errText2.substring(0, 200)}`);
        }
      } catch (e2) {
        console.log(`[getRemovedFromSprintIssues] Method 2 error: ${e2.message}`);
      }
    }

    // Method 3: JQL via v2 POST (different endpoint format)
    try {
      const jqlStr3 = `sprint was ${sprintId} AND NOT sprint = ${sprintId}`;
      console.log(`[getRemovedFromSprintIssues] Method 3: JQL v2 POST: ${jqlStr3}`);
      const response3 = await api.asUser().requestJira(route`/rest/api/2/search`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jql: jqlStr3,
          fields: fieldsArray,
          maxResults: 100
        })
      });

      if (response3.ok) {
        const data3 = await response3.json();
        const issues3 = data3.issues || [];
        console.log(`[getRemovedFromSprintIssues] Method 3 found ${issues3.length} issues`);
        if (issues3.length > 0) return issues3;
      } else {
        const errText3 = await response3.text();
        console.log(`[getRemovedFromSprintIssues] Method 3 failed: ${response3.status} - ${errText3.substring(0, 200)}`);
      }
    } catch (e3) {
      console.log(`[getRemovedFromSprintIssues] Method 3 error: ${e3.message}`);
    }

    // Method 4: Changelog-based detection - scan recent project issues
    // This is the most reliable method: find issues whose Sprint changelog shows removal from this sprint
    if (sprintName) {
      try {
        console.log(`[getRemovedFromSprintIssues] Method 4: Changelog-based detection for sprint "${sprintName}"`);
        // Search for issues updated recently that might have been in this sprint
        // Use project key from sprint name or board context
        const projectMatch = sprintName.match(/^([A-Z]+)/);
        let projectJql = '';
        if (projectMatch) {
          projectJql = `project = ${projectMatch[1]} AND `;
        }
        // Issues updated in last 30 days that are NOT in current sprint
        const searchJql = `${projectJql}updated >= -30d AND sprint != ${sprintId} ORDER BY updated DESC`;
        console.log(`[getRemovedFromSprintIssues] Method 4 JQL: ${searchJql}`);

        const response4 = await api.asUser().requestJira(route`/rest/api/2/search`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jql: searchJql,
            fields: fieldsArray,
            maxResults: 200
          })
        });

        if (response4.ok) {
          const data4 = await response4.json();
          const candidateIssues = data4.issues || [];
          console.log(`[getRemovedFromSprintIssues] Method 4: ${candidateIssues.length} candidate issues to check changelogs`);

          // Check changelogs of candidates to find ones removed from this sprint
          const removedIssues = [];
          const BATCH = 5;
          for (let i = 0; i < Math.min(candidateIssues.length, 100); i += BATCH) {
            const batch = candidateIssues.slice(i, i + BATCH);
            const results = await Promise.all(
              batch.map(async (issue) => {
                const histories = await getIssueChangelog(issue.key);
                // Check if any Sprint changelog shows removal from our sprint
                for (const history of histories) {
                  for (const item of (history.items || [])) {
                    if (item.field === 'Sprint') {
                      const fromStr = item.fromString || '';
                      const toStr = item.toString || '';
                      const fromId = item.from || '';
                      // Was in our sprint (from) and no longer in it (to)
                      const wasInSprint = fromStr.includes(sprintName) || String(fromId).includes(String(sprintId));
                      const stillInSprint = toStr.includes(sprintName);
                      if (wasInSprint && !stillInSprint) {
                        return { issue, removed: true };
                      }
                    }
                  }
                }
                return { issue, removed: false };
              })
            );
            results.filter(r => r.removed).forEach(r => removedIssues.push(r.issue));
          }

          console.log(`[getRemovedFromSprintIssues] Method 4 found ${removedIssues.length} removed issues via changelog scan`);
          if (removedIssues.length > 0) return removedIssues;
        } else {
          console.log(`[getRemovedFromSprintIssues] Method 4 search failed: ${response4.status}`);
        }
      } catch (e4) {
        console.log(`[getRemovedFromSprintIssues] Method 4 error: ${e4.message}`);
      }
    }

    console.log(`[getRemovedFromSprintIssues] All methods failed, returning empty`);
    return [];
  } catch (e) {
    console.log(`[getRemovedFromSprintIssues] Fatal error: ${e.message}`);
    return [];
  }
};

// ============ CHANGELOG API ============
const getIssueChangelog = async (issueKey) => {
  try {
    let allHistories = [];
    let startAt = 0;
    const maxResults = 100;

    do {
      const response = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=${maxResults}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!response.ok) return [];
      const data = await response.json();
      allHistories = allHistories.concat(data.values || []);
      if (allHistories.length >= (data.total || 0)) break;
      startAt += maxResults;
    } while (true);

    return allHistories;
  } catch (e) {
    return [];
  }
};

const analyzeSprintChangelog = (histories, sprintName, sprintId) => {
  let addedDate = null;
  let removedDate = null;

  const sorted = [...histories].sort((a, b) => new Date(a.created) - new Date(b.created));

  for (const history of sorted) {
    for (const item of (history.items || [])) {
      if (item.field === 'Sprint') {
        const fromStr = item.fromString || '';
        const toStr = item.toString || '';
        const fromId = item.from || '';
        const toId = item.to || '';

        const wasInFrom = fromStr.includes(sprintName) || fromId.includes(String(sprintId));
        const isInTo = toStr.includes(sprintName) || toId.includes(String(sprintId));

        if (!wasInFrom && isInTo) {
          addedDate = new Date(history.created);
        }

        if (wasInFrom && !isInTo) {
          removedDate = new Date(history.created);
          addedDate = null;
        }
      }
    }
  }

  return { addedDate, removedDate };
};

const getAllChangelogs = async (issues) => {
  const BATCH_SIZE = 5;
  const results = {};

  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (issue) => {
        const histories = await getIssueChangelog(issue.key);
        return { key: issue.key, histories };
      })
    );
    batchResults.forEach(r => { results[r.key] = r.histories; });
  }

  return results;
};

// ============ WORKLOG API ============
const getIssueWorklogs = async (issueKey) => {
  try {
    let allWorklogs = [];
    let startAt = 0;
    const maxResults = 100;

    do {
      const response = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}/worklog?startAt=${startAt}&maxResults=${maxResults}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!response.ok) return [];
      const data = await response.json();
      allWorklogs = allWorklogs.concat(data.worklogs || []);
      if (allWorklogs.length >= (data.total || 0)) break;
      startAt += maxResults;
    } while (true);

    return allWorklogs;
  } catch (e) {
    return [];
  }
};

const getAllWorklogs = async (issues) => {
  const BATCH_SIZE = 5;
  const allWorklogs = [];

  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(issue => getIssueWorklogs(issue.key))
    );
    results.forEach(worklogs => allWorklogs.push(...worklogs));
  }

  return allWorklogs;
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
  const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
  const activeIssues = issues.filter(i => {
    const status = (i.fields.status?.name || '').toLowerCase();
    return !doneStatuses.some(s => status.includes(s));
  });

  const baseline = {
    sprintId,
    createdAt: new Date().toISOString(),
    issueCount: activeIssues.length,
    issues: activeIssues.map(i => ({
      key: i.key,
      summary: i.fields.summary,
      originalEstimate: secondsToHours(i.fields.timeoriginalestimate),
      remainingEstimate: secondsToHours(i.fields.timeestimate),
      timeSpent: secondsToHours(i.fields.timespent),
      assignee: i.fields.assignee?.displayName || null,
      status: i.fields.status?.name || 'To Do',
      issueType: i.fields.issuetype?.name || 'Task',
      isSubtask: i.fields.issuetype?.subtask === true || (i.fields.issuetype?.name || '').toLowerCase().includes('sub-task') || (i.fields.issuetype?.name || '').toLowerCase().includes('subtask'),
      parentKey: i.fields.parent?.key || null
    }))
  };
  await storage.set(`baseline-${sprintId}`, baseline);
  return baseline;
};

const deleteSprintBaseline = async (sprintId) => {
  try {
    await storage.delete(`baseline-${sprintId}`);
    return true;
  } catch (e) {
    return false;
  }
};

// ============ BURNDOWN DATA ============
resolver.define('getBurndownData', async ({ payload }) => {
  try {
    const { boardId, assignee, teamSize: configTeamSize } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let allIssues = await getSprintIssues(sprint.id);

    // Get or create baseline
    let baseline = await getSprintBaseline(sprint.id);

    // Auto-detect corrupted baseline
    if (baseline) {
      const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
      const currentActiveCount = allIssues.filter(i => {
        const status = (i.fields.status?.name || '').toLowerCase();
        return !doneStatuses.some(s => status.includes(s));
      }).length;

      if (baseline.issues.length < currentActiveCount * 0.3 && baseline.issues.length < 10) {
        await deleteSprintBaseline(sprint.id);
        baseline = null;
      }
    }

    if (!baseline) {
      baseline = await saveSprintBaseline(sprint.id, allIssues);
    }

    const allAssignees = [...new Set(allIssues.map(i => i.fields.assignee?.displayName).filter(Boolean))];

    let issues = allIssues;
    let teamSize = configTeamSize || allAssignees.length || 1;
    let filteredBaseline = baseline;

    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
      teamSize = 1;
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
    const maxCapacity = workingDays * HOURS_PER_DAY * teamSize;

    // Original Estimate from baseline using subtask logic
    const totalOriginalEstimate = filteredBaseline?.issues?.reduce((sum, item) =>
      sum + (item.originalEstimate || 0), 0
    ) || computeEffectiveOriginalEstimate(issues);

    // FIX: Current remaining and spent using subtask-aware logic to avoid duplicate
    const currentRemaining = computeEffectiveRemaining(issues);
    const totalSpent = computeEffectiveSpent(issues);

    // ============ CHANGELOG-BASED SCOPE CHANGES ============
    const sprintStartDate = new Date(sprint.startDate);
    sprintStartDate.setHours(0, 0, 0, 0);

    // Pre-filter: only fetch changelogs for issues potentially added after sprint start
    const issuesNeedingChangelog = issues.filter(issue => {
      const createdDate = new Date(issue.fields.created);
      createdDate.setHours(0, 0, 0, 0);
      return createdDate >= sprintStartDate;
    });

    const allChangelogs = await getAllChangelogs(issuesNeedingChangelog);

    const addedIssues = [];
    const scopeChangesByDate = {};

    issues.forEach(issue => {
      const histories = allChangelogs[issue.key] || [];
      const { addedDate } = analyzeSprintChangelog(histories, sprint.name, sprint.id);

      let issueAddedDate = null;

      if (addedDate) {
        const addedDay = new Date(addedDate);
        addedDay.setHours(0, 0, 0, 0);
        if (addedDay > sprintStartDate) {
          issueAddedDate = addedDay;
        }
      } else {
        const createdDate = new Date(issue.fields.created);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate > sprintStartDate) {
          issueAddedDate = createdDate;
        }
      }

      if (issueAddedDate) {
        const dateStr = issueAddedDate.toISOString().split('T')[0];
        const oe = secondsToHours(issue.fields.timeoriginalestimate);

        addedIssues.push({
          key: issue.key,
          summary: issue.fields.summary,
          addedDate: dateStr,
          originalEstimate: oe
        });

        if (!scopeChangesByDate[dateStr]) {
          scopeChangesByDate[dateStr] = { added: 0, removed: 0 };
        }
        scopeChangesByDate[dateStr].added += oe;
      }
    });

    // ============ REMOVED ISSUES ============
    const removedFromSprintIssues = await getRemovedFromSprintIssues(sprint.id, sprint.name);
    const removedIssues = [];

    if (removedFromSprintIssues.length > 0) {
      const removedChangelogs = await getAllChangelogs(removedFromSprintIssues);

      for (const removedIssue of removedFromSprintIssues) {
        const histories = removedChangelogs[removedIssue.key] || [];
        const { removedDate } = analyzeSprintChangelog(histories, sprint.name, sprint.id);

        let removeDateStr;
        if (removedDate) {
          removeDateStr = removedDate.toISOString().split('T')[0];
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          removeDateStr = today <= endDate
            ? today.toISOString().split('T')[0]
            : endDate.toISOString().split('T')[0];
        }

        const oe = secondsToHours(removedIssue.fields.timeoriginalestimate);

        removedIssues.push({
          key: removedIssue.key,
          summary: removedIssue.fields.summary,
          removedDate: removeDateStr,
          originalEstimate: oe
        });

        if (!scopeChangesByDate[removeDateStr]) {
          scopeChangesByDate[removeDateStr] = { added: 0, removed: 0 };
        }
        scopeChangesByDate[removeDateStr].removed += oe;
      }
    }

    const scopeAddedTotal = addedIssues.reduce((sum, i) => sum + (i.originalEstimate || 0), 0);
    const scopeRemovedTotal = removedIssues.reduce((sum, i) => sum + (i.originalEstimate || 0), 0);

    // ============ WORKLOG-BASED REMAINING ============
    const allWorklogs = await getAllWorklogs(issues);

    const worklogByDate = {};
    allWorklogs.forEach(wl => {
      const dateStr = wl.started ? wl.started.split('T')[0] : null;
      if (dateStr) {
        if (!worklogByDate[dateStr]) worklogByDate[dateStr] = 0;
        worklogByDate[dateStr] += secondsToHours(wl.timeSpentSeconds || 0);
      }
    });

    // Generate data points
    const dataPoints = [];
    const current = new Date(startDate);
    let workingDayCount = 0;
    const dailyDecrease = maxCapacity / workingDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let runningRemaining = totalOriginalEstimate;
    let cumulativeLogged = 0;

    dataPoints.push({
      date: 'start',
      displayDate: 'Start Sprint',
      ideal: Math.round(maxCapacity * 10) / 10,
      remaining: Math.round(totalOriginalEstimate * 10) / 10,
      timeLogged: 0,
      dayLogged: 0,
      cumulativeLogged: 0,
      added: 0,
      removed: 0
    });

    while (current <= endDate) {
      if (isWorkingDay(current) && current > startDate) {
        workingDayCount++;
      }

      const ideal = Math.max(0, maxCapacity - (dailyDecrease * workingDayCount));
      const dateStr = current.toISOString().split('T')[0];
      const currentDate = new Date(current);
      currentDate.setHours(0, 0, 0, 0);
      const isPastOrToday = currentDate <= today;

      const scopeChange = scopeChangesByDate[dateStr] || { added: 0, removed: 0 };
      const dayLogged = worklogByDate[dateStr] || 0;

      if (isPastOrToday) {
        cumulativeLogged += dayLogged;
        runningRemaining = runningRemaining - dayLogged + scopeChange.added - scopeChange.removed;
      }

      // FIX: remaining already includes scope added (line 694: runningRemaining += scopeChange.added)
      // So for stacked bar chart: remaining bar = runningRemaining - today's added
      // added bar = today's added
      // Visual total = remaining bar + added bar = runningRemaining (correct!)
      const remainingForChart = isPastOrToday
        ? Math.round((runningRemaining - scopeChange.added) * 10) / 10
        : null;

      dataPoints.push({
        date: dateStr,
        displayDate: formatDate(dateStr),
        ideal: Math.round(ideal * 10) / 10,
        remaining: remainingForChart,
        totalRemaining: isPastOrToday ? Math.round(runningRemaining * 10) / 10 : null,
        timeLogged: isPastOrToday ? Math.round(cumulativeLogged * 10) / 10 : null,
        dayLogged: isPastOrToday ? Math.round(dayLogged * 10) / 10 : null,
        cumulativeLogged: isPastOrToday ? Math.round(cumulativeLogged * 10) / 10 : null,
        added: scopeChange.added > 0 ? Math.round(scopeChange.added * 10) / 10 : 0,
        removed: scopeChange.removed > 0 ? -Math.round(scopeChange.removed * 10) / 10 : 0
      });
      current.setDate(current.getDate() + 1);
    }

    // FIX: Issue details with subtask-aware effective values
    const { subtasksByParent, subtaskKeys, parentKeys } = buildSubtaskMap(issues);

    const issueDetails = issues.map(i => {
      const isSubtask = isSubtaskIssue(i) || subtaskKeys.has(i.key);
      const hasSubtasks = parentKeys.has(i.key);
      const hasSubtasksInList = subtasksByParent[i.key] && subtasksByParent[i.key].length > 0;

      let effectiveOE = secondsToHours(i.fields.timeoriginalestimate);
      let effectiveRemaining = secondsToHours(i.fields.timeestimate);
      let effectiveSpent = secondsToHours(i.fields.timespent);
      let skippedInTotal = false;

      if (hasSubtasks) {
        if (hasSubtasksInList) {
          // Parent with subtasks in filtered list → show subtask totals
          effectiveOE = subtasksByParent[i.key].reduce((sum, sub) =>
            sum + secondsToHours(sub.fields.timeoriginalestimate), 0
          );
          effectiveRemaining = subtasksByParent[i.key].reduce((sum, sub) =>
            sum + secondsToHours(sub.fields.timeestimate), 0
          );
          effectiveSpent = subtasksByParent[i.key].reduce((sum, sub) =>
            sum + secondsToHours(sub.fields.timespent), 0
          );
        } else {
          // Parent with subtasks but NONE in filtered list → SKIP from totals
          // Show raw values but mark as skipped
          skippedInTotal = true;
        }
      }

      return {
        key: i.key,
        summary: i.fields.summary,
        assignee: i.fields.assignee?.displayName || 'Unassigned',
        status: i.fields.status?.name || 'To Do',
        originalEstimate: effectiveOE,
        remainingEstimate: effectiveRemaining,
        timeSpent: effectiveSpent,
        issueType: i.fields.issuetype?.name || 'Task',
        isSubtask,
        hasSubtasks,
        skippedInTotal,
        subtaskCount: i.fields.subtasks?.length || 0,
        parentKey: i.fields.parent?.key || null
      };
    });
    sortByStatus(issueDetails);

    // FIX: Also return removed issue details for debug panel
    const removedIssueDetails = removedIssues.map(ri => ({
      key: ri.key,
      summary: ri.summary,
      removedDate: ri.removedDate,
      originalEstimate: ri.originalEstimate
    }));

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
        removedIssuesCount: removedIssues.length,
        issueDetails,
        removedIssueDetails,
        addedIssues,
        baselineIssueCount: filteredBaseline?.issues?.length || 0,
        jiraBaseUrl: JIRA_BASE_URL,
        _debug: {
          totalIssuesInSprint: allIssues.length,
          removedFromSprintCount: removedFromSprintIssues.length,
          removedIssueKeys: removedIssues.map(r => r.key),
          addedIssueKeys: addedIssues.map(a => a.key),
          subtaskCount: subtaskKeys.size,
          parentWithSubtasksCount: parentKeys.size
        }
      }
    };
  } catch (error) {
    console.log(`[getBurndownData] Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// ============ DELETE BASELINE ============
resolver.define('deleteBaseline', async ({ payload }) => {
  try {
    const { boardId } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    await deleteSprintBaseline(sprint.id);
    return { success: true, message: `Baseline for sprint ${sprint.name} deleted.` };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ SPRINT HEALTH ============
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

// ============ AT RISK ITEMS ============
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

    sortByStatus(atRiskItems);

    return { success: true, data: { items: atRiskItems, total: atRiskItems.length, sprintName: sprint.name } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ SCOPE CHANGES ============
resolver.define('getScopeChanges', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };

    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };

    let allIssues = await getSprintIssues(sprint.id);
    if (assignee && assignee !== 'All') {
      allIssues = allIssues.filter(i => i.fields.assignee?.displayName === assignee);
    }

    const sprintStartDate = new Date(sprint.startDate);
    sprintStartDate.setHours(0, 0, 0, 0);

    // Only fetch changelogs for issues that could have been added after sprint start
    const issuesNeedingChangelog = allIssues.filter(issue => {
      const createdDate = new Date(issue.fields.created);
      createdDate.setHours(0, 0, 0, 0);
      return createdDate >= sprintStartDate;
    });

    const allChangelogs = await getAllChangelogs(issuesNeedingChangelog);

    const added = [];

    allIssues.forEach(issue => {
      const histories = allChangelogs[issue.key] || [];
      const { addedDate } = analyzeSprintChangelog(histories, sprint.name, sprint.id);

      let issueAddedDate = null;
      let changeSource = '';

      if (addedDate) {
        const addedDay = new Date(addedDate);
        addedDay.setHours(0, 0, 0, 0);
        if (addedDay > sprintStartDate) {
          issueAddedDate = addedDay;
          changeSource = 'sprint_changelog';
        }
      } else {
        const createdDate = new Date(issue.fields.created);
        createdDate.setHours(0, 0, 0, 0);
        if (createdDate > sprintStartDate) {
          issueAddedDate = createdDate;
          changeSource = 'created_after_start';
        }
      }

      if (issueAddedDate) {
        added.push({
          key: issue.key,
          summary: issue.fields.summary,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          priority: issue.fields.priority?.name,
          status: issue.fields.status?.name,
          changeType: 'ADDED',
          changeDate: issueAddedDate.toISOString(),
          changeSource,
          originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
          remainingEstimate: secondsToHours(issue.fields.timeestimate)
        });
      }
    });

    // ============ REMOVED ISSUES ============
    const removedFromSprintIssues = await getRemovedFromSprintIssues(sprint.id, sprint.name);
    const removed = [];

    if (removedFromSprintIssues.length > 0) {
      const removedChangelogs = await getAllChangelogs(removedFromSprintIssues);

      for (const removedIssue of removedFromSprintIssues) {
        const histories = removedChangelogs[removedIssue.key] || [];
        const { removedDate } = analyzeSprintChangelog(histories, sprint.name, sprint.id);

        removed.push({
          key: removedIssue.key,
          summary: removedIssue.fields.summary,
          assignee: removedIssue.fields.assignee?.displayName || 'Unassigned',
          priority: removedIssue.fields.priority?.name,
          status: removedIssue.fields.status?.name || 'Removed from sprint',
          changeType: 'REMOVED',
          changeDate: removedDate ? removedDate.toISOString() : new Date().toISOString(),
          changeSource: removedDate ? 'sprint_changelog' : 'jql_was_sprint',
          originalEstimate: secondsToHours(removedIssue.fields.timeoriginalestimate),
          remainingEstimate: secondsToHours(removedIssue.fields.timeestimate)
        });
      }
    }

    sortByStatus(added);

    return {
      success: true,
      data: {
        added,
        removed,
        priorityChanged: [],
        totalAdded: added.length,
        totalRemoved: removed.length,
        totalPriorityChanged: 0,
        sprintName: sprint.name,
        sprintStartDate: sprint.startDate
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ HIGH PRIORITY ITEMS ============
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
      const statusA = getStatusOrder(a.status);
      const statusB = getStatusOrder(b.status);
      if (statusA !== statusB) return statusA - statusB;
      const pA = priorityOrder[a.priority] || 3;
      const pB = priorityOrder[b.priority] || 3;
      return pA - pB;
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

// ============ RELEASE DATA ============
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

    const releases = Array.from(releaseMap.values()).map(r => {
      sortByStatus(r.issues);
      return {
        ...r,
        progress: r.totalIssues > 0 ? Math.round((r.doneIssues / r.totalIssues) * 100) : 0,
        totalEstimate: Math.round(r.totalEstimate * 10) / 10,
        doneEstimate: Math.round(r.doneEstimate * 10) / 10
      };
    });

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
