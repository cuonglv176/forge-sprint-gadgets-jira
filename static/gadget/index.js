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
  const fields = 'summary,status,priority,assignee,timeoriginalestimate,timeestimate,timespent,duedate,created,updated';
  const response = await api.asUser().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=200&fields=${fields}`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!response.ok) throw new Error(`Failed to fetch issues: ${response.status}`);
  const data = await response.json();
  return data.issues || [];
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

resolver.define('getBurndownData', async ({ payload }) => {
  try {
    const { boardId, assignee, teamSize: configTeamSize } = payload;
    if (!boardId) return { success: false, error: 'Board ID is required' };
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) return { success: false, error: 'No active sprint found' };
    
    let issues = await getSprintIssues(sprint.id);
    const allAssignees = [...new Set(issues.map(i => i.fields.assignee?.displayName).filter(Boolean))];
    
    let teamSize = configTeamSize || allAssignees.length || 1;
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => i.fields.assignee?.displayName === assignee);
      teamSize = 1;
    }
    
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const workingDays = countWorkingDays(startDate, endDate);
    const maxCapacity = workingDays * HOURS_PER_DAY * teamSize;
    
    const currentRemaining = issues.reduce((sum, issue) => sum + secondsToHours(issue.fields.timeestimate), 0);
    const totalSpent = issues.reduce((sum, issue) => sum + secondsToHours(issue.fields.timespent), 0);
    
    const dataPoints = [];
    const current = new Date(startDate);
    let workingDayCount = 0;
    const dailyDecrease = maxCapacity / workingDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    while (current <= endDate) {
      if (isWorkingDay(current) && current > startDate) workingDayCount++;
      const ideal = Math.max(0, maxCapacity - (dailyDecrease * workingDayCount));
      const dateStr = current.toISOString().split('T')[0];
      const currentDate = new Date(current);
      currentDate.setHours(0, 0, 0, 0);
      const isPastOrToday = currentDate <= today;
      
      dataPoints.push({
        date: dateStr,
        displayDate: formatDate(dateStr),
        ideal: Math.round(ideal * 10) / 10,
        remaining: isPastOrToday ? currentRemaining : null,
        timeLogged: isPastOrToday ? totalSpent : null,
        added: 0,
        removed: 0
      });
      current.setDate(current.getDate() + 1);
    }
    
    return {
      success: true,
      data: { dataPoints, sprintName: sprint.name, sprintId: sprint.id, startDate: sprint.startDate, endDate: sprint.endDate, maxCapacity: Math.round(maxCapacity * 10) / 10, workingDays, teamSize, assignees: allAssignees }
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
        key: issue.key, summary: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        priority: issue.fields.priority?.name,
        status: issue.fields.status?.name,
        originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
        remainingEstimate: secondsToHours(issue.fields.timeestimate)
      }));
    
    return {
      success: true,
      data: {
        items: highPriorityItems, total: highPriorityItems.length,
        highestCount: highPriorityItems.filter(i => i.priority === 'Highest').length,
        highCount: highPriorityItems.filter(i => i.priority === 'High').length,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

export const handler = resolver.getDefinitions();
