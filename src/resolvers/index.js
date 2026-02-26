import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

// ============ CONSTANTS ============
const WORKING_DAYS_DEFAULT = 10;
const HOURS_PER_DAY = 8;

// ============ HELPER FUNCTIONS ============

/**
 * Check if date is working day (Monday-Friday)
 */
const isWorkingDay = (date) => {
  const day = new Date(date).getDay();
  return day !== 0 && day !== 6;
};

/**
 * Count working days between two dates
 */
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

/**
 * Convert Jira time (seconds) to hours
 */
const secondsToHours = (seconds) => {
  if (!seconds) return 0;
  return Math.round((seconds / 3600) * 10) / 10;
};

/**
 * Format date to display string
 */
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

// ============ JIRA API CALLS ============

/**
 * Get all Scrum boards
 */
const getBoards = async () => {
  const response = await api.asUser().requestJira(
    route`/rest/agile/1.0/board?type=scrum&maxResults=50`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch boards: ${response.status}`);
  }
  
  const data = await response.json();
  return data.values || [];
};

/**
 * Get active sprint for a board
 */
const getActiveSprint = async (boardId) => {
  const response = await api.asUser().requestJira(
    route`/rest/agile/1.0/board/${boardId}/sprint?state=active`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  if (!response.ok) {
    return null;
  }
  
  const data = await response.json();
  return data.values?.[0] || null;
};

/**
 * Get sprint details
 */
const getSprint = async (sprintId) => {
  const response = await api.asUser().requestJira(
    route`/rest/agile/1.0/sprint/${sprintId}`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  if (!response.ok) {
    return null;
  }
  
  return await response.json();
};

/**
 * Get sprint issues with all required fields
 */
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
        'duedate', 'created', 'updated', 'fixVersions', 'parent',
        'worklog'
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
};

/**
 * Get sprint baseline from storage
 * Baseline is captured when sprint starts
 */
const getSprintBaseline = async (sprintId) => {
  try {
    const baseline = await storage.get(`baseline-${sprintId}`);
    return baseline || null;
  } catch (error) {
    console.error('Error getting baseline:', error);
    return null;
  }
};

/**
 * Save sprint baseline to storage
 */
const saveSprintBaseline = async (sprintId, issues) => {
  try {
    const baseline = issues.map(issue => ({
      key: issue.key,
      priority: issue.fields.priority?.name,
      originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
      addedAt: issue.fields.created,
      isSubtask: issue.fields.issuetype?.subtask === true || !!issue.fields.parent,
      assigneeDisplayName: issue.fields.assignee?.displayName || null,
      assigneeAccountId: issue.fields.assignee?.accountId || null
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

// ============ RESOLVERS ============

/**
 * Get available Scrum boards for configuration
 */
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

/**
 * Get gadget configuration from storage
 */
resolver.define('getConfig', async ({ context }) => {
  try {
    const gadgetId = context.extension?.gadget?.id || 'default';
    const config = await storage.get(`config-${gadgetId}`);
    return config || { boardId: null, teamSize: 10, workingDays: 10 };
  } catch (error) {
    console.error('Error getting config:', error);
    return { boardId: null, teamSize: 10, workingDays: 10 };
  }
});

/**
 * Save gadget configuration to storage
 */
resolver.define('saveConfig', async ({ payload, context }) => {
  try {
    const gadgetId = context.extension?.gadget?.id || 'default';
    await storage.set(`config-${gadgetId}`, payload);
    return { success: true };
  } catch (error) {
    console.error('Error saving config:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get Burndown Chart data
 * 
 * UPDATED LOGIC per SRS v2.1:
 * - Ideal Line: Based on ORIGINAL ESTIMATE (sum of all tasks at sprint start)
 * - Actual Remaining: Current remaining estimate
 * - Scope Added: Tasks added after sprint start (stacked on top, orange)
 * - Scope Removed: Tasks removed from sprint (negative bar, red)
 */
resolver.define('getBurndownData', async ({ payload }) => {
  try {
    const { boardId, assignee, teamSize: configTeamSize } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    // Get active sprint
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
    // Get sprint issues (includes both tasks and subtasks)
    let allIssues = await getSprintIssues(sprint.id);
    
    // Get or create baseline
    let baseline = await getSprintBaseline(sprint.id);
    if (!baseline) {
      // First time - create baseline
      await saveSprintBaseline(sprint.id, allIssues);
      baseline = await getSprintBaseline(sprint.id);
    }
    
    // Helper: check if an issue is a subtask
    const isSubtask = (issue) => {
      return issue.fields.issuetype?.subtask === true || !!issue.fields.parent;
    };
    
    // Get unique assignees (from all issues including subtasks)
    const allAssignees = [...new Set(
      allIssues
        .map(i => i.fields.assignee?.displayName)
        .filter(Boolean)
    )];
    
    // Filter by assignee if specified
    let issues = allIssues;
    // teamSize = số lượng assignees thực tế trong sprint
    // Chỉ fallback sang config nếu không tìm thấy assignees
    let teamSize = allAssignees.length || configTeamSize || 1;
    
    // Deep clone baseline to avoid mutating the original
    let filteredBaseline = baseline ? {
      ...baseline,
      issues: baseline.issues ? [...baseline.issues] : []
    } : { issues: [] };
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
      teamSize = 1;
      
      // Filter baseline by assignee using stored assignee info, 
      // falling back to current issue data
      filteredBaseline.issues = filteredBaseline.issues.filter(b => {
        // First check stored assignee info in baseline
        if (b.assigneeDisplayName || b.assigneeAccountId) {
          return b.assigneeDisplayName === assignee ||
                 b.assigneeAccountId === assignee;
        }
        // Fallback: check current issue data
        const fullIssue = allIssues.find(i => i.key === b.key);
        return fullIssue?.fields.assignee?.displayName === assignee ||
               fullIssue?.fields.assignee?.accountId === assignee;
      });
    }
    
    // Calculate dates
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);

    // Working days = tất cả ngày làm việc (Mon-Fri) từ startDate đến endDate (inclusive)
    // Ví dụ: Sprint 23/02 (Mon) → 06/03 (Fri) = 10 working days
    // maxCapacity = 10 × 8 × 6 = 480h
    const workingDays = countWorkingDays(startDate, endDate);

    // Calculate MAX CAPACITY (for Ideal Line)
    // Formula: workingDays × 8 hours × teamSize
    // Ví dụ: Sprint 23/02 → 06/03 = 10 working days
    //   maxCapacity = 10 × 8 × 6 = 480h
    const maxCapacity = workingDays * HOURS_PER_DAY * teamSize;

    // ====== DEBUG LOG ======
    console.log('[BURNDOWN DEBUG]', JSON.stringify({
      sprintStart: sprint.startDate,
      sprintEnd: sprint.endDate,
      workingDays,
      teamSize,
      maxCapacity,
      assignee: assignee || 'All',
      allAssigneesCount: allAssignees.length,
      configTeamSize,
      totalIssues: allIssues.length,
      filteredIssues: issues.length,
      baselineIssues: filteredBaseline.issues?.length,
      baselineHasSubtaskInfo: filteredBaseline.issues?.[0]?.isSubtask !== undefined,
      baselineHasAssigneeInfo: filteredBaseline.issues?.[0]?.assigneeDisplayName !== undefined
    }));
    // ====== END DEBUG ======

    // ============================================================
    // FIX: Original Estimate = only TASKS (not subtasks)
    // ============================================================
    // From baseline: filter out subtasks
    const baselineTasksOnly = filteredBaseline.issues.filter(b => !b.isSubtask);
    const totalOriginalEstimate = baselineTasksOnly.length > 0
      ? baselineTasksOnly.reduce((sum, item) => sum + (item.originalEstimate || 0), 0)
      : issues
          .filter(i => !isSubtask(i))
          .reduce((sum, issue) => sum + secondsToHours(issue.fields.timeoriginalestimate), 0);
    
    // ============================================================
    // Remaining & Time Logged = ALL issues (task + subtask)
    // because work is logged on subtasks
    // ============================================================
    const currentRemaining = issues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timeestimate), 0
    );
    
    const totalSpent = issues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timespent), 0
    );
    
    // ============================================================
    // Scope Changes: compare baseline vs current (tasks only for scope)
    // ============================================================
    const baselineKeys = new Set(filteredBaseline.issues.map(i => i.key));
    const currentKeys = new Set(issues.map(i => i.key));
    
    // Added: issues in current sprint but NOT in baseline
    // (don't require created > startDate, as issue may have existed before but added to sprint later)
    const addedIssues = issues.filter(i => !baselineKeys.has(i.key));
    
    // Removed: issues in baseline but NOT in current sprint
    const removedIssues = filteredBaseline.issues.filter(b => !currentKeys.has(b.key));
    
    // Calculate scope totals (tasks only for meaningful scope tracking)
    const addedTasksOnly = addedIssues.filter(i => !isSubtask(i));
    const removedTasksOnly = removedIssues.filter(b => !b.isSubtask);
    
    const scopeAddedTotal = addedTasksOnly.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timeoriginalestimate), 0
    );
    
    const scopeRemovedTotal = removedTasksOnly.reduce((sum, item) =>
      sum + (item.originalEstimate || 0), 0
    );

    // ============================================================
    // WORKLOGS: Collect per-day time logged from all sprint issues
    // ============================================================
    const dailyTimeLogged = {};
    let totalWorklogHours = 0;
    issues.forEach(issue => {
      const worklogs = issue.fields.worklog?.worklogs || [];
      worklogs.forEach(wl => {
        const logDate = new Date(wl.started).toISOString().split('T')[0];
        if (!dailyTimeLogged[logDate]) dailyTimeLogged[logDate] = 0;
        const hours = secondsToHours(wl.timeSpentSeconds);
        dailyTimeLogged[logDate] += hours;
        totalWorklogHours += hours;
      });
    });

    // ============================================================
    // STARTING REMAINING: Sum of ALL baseline OEs (tasks + subtasks)
    // This is the total remaining work at sprint activation
    // ============================================================
    const startingRemaining = filteredBaseline.issues.reduce(
      (sum, b) => sum + (b.originalEstimate || 0), 0
    ) || (currentRemaining + totalSpent); // fallback nếu baseline chưa có OE

    // ============================================================
    // SCOPE CHANGES BY DATE (for chart bars - tasks only)
    // ============================================================
    const scopeChangesByDate = {};

    // Track added issues by date (tasks only for chart bars)
    addedTasksOnly.forEach(issue => {
      const addedDate = new Date(issue.fields.created).toISOString().split('T')[0];
      if (!scopeChangesByDate[addedDate]) {
        scopeChangesByDate[addedDate] = { added: 0, removed: 0 };
      }
      scopeChangesByDate[addedDate].added += secondsToHours(issue.fields.timeoriginalestimate);
    });

    // Track removed issues - use today's date as removal date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    if (removedTasksOnly.length > 0) {
      const removedDate = today <= endDate ? todayStr : endDate.toISOString().split('T')[0];
      if (!scopeChangesByDate[removedDate]) {
        scopeChangesByDate[removedDate] = { added: 0, removed: 0 };
      }
      removedTasksOnly.forEach(item => {
        scopeChangesByDate[removedDate].removed += (item.originalEstimate || 0);
      });
    }

    // ============================================================
    // SCOPE CHANGES FOR REMAINING (ALL issues including subtasks)
    // Used in forward remaining calculation
    // ============================================================
    const allAddedIssues = issues.filter(i => !baselineKeys.has(i.key));
    const allRemovedIssues = filteredBaseline.issues.filter(b => !currentKeys.has(b.key));

    const remainingScopeByDate = {};
    allAddedIssues.forEach(issue => {
      const addedDate = new Date(issue.fields.created).toISOString().split('T')[0];
      if (!remainingScopeByDate[addedDate]) {
        remainingScopeByDate[addedDate] = { added: 0, removed: 0 };
      }
      remainingScopeByDate[addedDate].added += secondsToHours(issue.fields.timeoriginalestimate);
    });

    if (allRemovedIssues.length > 0) {
      const removedDate = today <= endDate ? todayStr : endDate.toISOString().split('T')[0];
      if (!remainingScopeByDate[removedDate]) {
        remainingScopeByDate[removedDate] = { added: 0, removed: 0 };
      }
      allRemovedIssues.forEach(item => {
        remainingScopeByDate[removedDate].removed += (item.originalEstimate || 0);
      });
    }

    // ====== DEBUG LOG 2 ======
    console.log('[BURNDOWN DEBUG 2]', JSON.stringify({
      totalOriginalEstimate,
      currentRemaining,
      totalSpent,
      startingRemaining,
      totalWorklogHours,
      scopeAddedTotal,
      scopeRemovedTotal,
      addedTasksCount: addedTasksOnly.length,
      removedTasksCount: removedTasksOnly.length,
      dailyTimeLogged,
      allAddedCount: allAddedIssues.length,
      allRemovedCount: allRemovedIssues.length
    }));
    // ====== END DEBUG 2 ======

    // ============================================================
    // GENERATE DATA POINTS
    // ============================================================
    const dataPoints = [];
    const current = new Date(startDate);
    let workingDayCount = 0;
    const startDateStr = startDate.toISOString().split('T')[0];

    // IDEAL: Linear from maxCapacity → 0
    // Loop skips startDate in count (0 → workingDays-1)
    // dailyDecrease = maxCapacity / (workingDays - 1)
    const dailyDecrease = workingDays > 1 ? maxCapacity / (workingDays - 1) : maxCapacity;

    // REMAINING: Forward calculation
    // Start from baseline OE, subtract daily logged hours, adjust for scope
    let runningRemaining = startingRemaining;
    let cumulativeLogged = 0;

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const currentDate = new Date(current);
      currentDate.setHours(0, 0, 0, 0);

      // Count working days after startDate (for ideal line)
      if (isWorkingDay(current) && dateStr !== startDateStr) {
        workingDayCount++;
      }

      // IDEAL: Linear decrease from maxCapacity
      const ideal = Math.max(0, maxCapacity - (dailyDecrease * workingDayCount));

      const isPastOrToday = currentDate <= today;

      // Per-day time logged from worklogs
      const dayLogged = dailyTimeLogged[dateStr] || 0;

      // Scope changes for remaining (all issues)
      const dayScope = remainingScopeByDate[dateStr] || { added: 0, removed: 0 };

      // Update running remaining for past/today
      if (isPastOrToday) {
        runningRemaining = runningRemaining - dayLogged + dayScope.added - dayScope.removed;
        cumulativeLogged += dayLogged;
      }

      // Scope changes for chart bars (tasks only)
      const scopeChange = scopeChangesByDate[dateStr] || { added: 0, removed: 0 };

      dataPoints.push({
        date: dateStr,
        displayDate: formatDate(dateStr),
        ideal: Math.round(ideal * 10) / 10,
        remaining: isPastOrToday ? Math.round(runningRemaining * 10) / 10 : null,
        timeLogged: isPastOrToday ? Math.round(cumulativeLogged * 10) / 10 : null,
        added: scopeChange.added > 0 ? Math.round(scopeChange.added * 10) / 10 : 0,
        removed: scopeChange.removed > 0 ? -Math.round(scopeChange.removed * 10) / 10 : 0,
        // Debug: per-day logged hours
        dayLogged: Math.round(dayLogged * 10) / 10
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
        addedIssuesCount: addedTasksOnly.length,
        removedIssuesCount: removedTasksOnly.length
      }
    };
  } catch (error) {
    console.error('Error in getBurndownData:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get Sprint Health
 * 
 * Business Logic per SRS v2.1:
 * Classification:
 * - UNDERESTIMATED (Orange): Original < (Spent + Remaining)
 * - NORMAL (Blue): Original == (Spent + Remaining)
 * - GOOD (Green): Original > (Spent + Remaining)
 */
resolver.define('getSprintHealth', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
    let issues = await getSprintIssues(sprint.id);
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
    }
    
    let underCount = 0;
    let normalCount = 0;
    let goodCount = 0;
    
    const details = issues.map(issue => {
      const original = secondsToHours(issue.fields.timeoriginalestimate);
      const spent = secondsToHours(issue.fields.timespent);
      const remaining = secondsToHours(issue.fields.timeestimate);
      
      const totalActual = spent + remaining;
      const variance = totalActual - original;
      
      let classification;
      let color;
      
      // SRS v2.1 Classification Rules
      if (original < totalActual) {
        classification = 'UNDERESTIMATED';
        color = '#FF991F'; // Orange
        underCount++;
      } else if (Math.abs(original - totalActual) < 0.1) { // Account for floating point
        classification = 'NORMAL';
        color = '#0065FF'; // Blue
        normalCount++;
      } else {
        classification = 'GOOD';
        color = '#36B37E'; // Green
        goodCount++;
      }
      
      return {
        key: issue.key,
        summary: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        assigneeAvatar: issue.fields.assignee?.avatarUrls?.['24x24'],
        status: issue.fields.status?.name,
        priority: issue.fields.priority?.name || 'Medium',
        classification,
        color,
        original,
        spent,
        remaining,
        totalActual,
        variance: Math.round(variance * 10) / 10
      };
    });
    
    return {
      success: true,
      data: {
        counts: {
          under: underCount,
          normal: normalCount,
          good: goodCount,
          total: issues.length
        },
        details,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getSprintHealth:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get At Risk Items
 * 
 * Business Logic per SRS v2.1:
 * Triggers (OR Logic):
 * - TIME_BOX_EXCEEDED: Remaining = 0 AND Status != Done/Closed
 * - DEADLINE_EXCEEDED: Due Date <= Today AND Status != Done/Closed
 * 
 * Sorting:
 * 1. Due Date (ASC - earliest first)
 * 2. Priority (DESC - highest first)
 */
resolver.define('getAtRiskItems', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
    let issues = await getSprintIssues(sprint.id);
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
    }
    
    const atRiskItems = [];
    const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    issues.forEach(issue => {
      const status = issue.fields.status?.name?.toLowerCase() || '';
      
      // Skip done issues
      if (doneStatuses.some(s => status.includes(s))) return;
      
      let riskReason = null;
      const remaining = secondsToHours(issue.fields.timeestimate);
      const original = secondsToHours(issue.fields.timeoriginalestimate);
      const dueDate = issue.fields.duedate ? new Date(issue.fields.duedate) : null;
      
      // SRS v2.1: Check Time Box Exceeded
      if (remaining === 0 && original > 0) {
        riskReason = 'TIME_BOX_EXCEEDED';
      }
      
      // SRS v2.1: Check Deadline Exceeded (takes precedence)
      if (dueDate) {
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate <= now) {
          riskReason = 'DEADLINE_EXCEEDED';
        }
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
          originalEstimate: original,
          remainingEstimate: remaining,
          timeSpent: secondsToHours(issue.fields.timespent),
          riskReason
        });
      }
    });
    
    // SRS v2.1: Sort by Due Date ASC, then Priority DESC
    const priorityOrder = { 'Highest': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Lowest': 5 };
    atRiskItems.sort((a, b) => {
      // Primary: Due Date (earliest first)
      const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
      const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
      if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
      
      // Secondary: Priority (highest first)
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });
    
    return {
      success: true,
      data: {
        items: atRiskItems,
        total: atRiskItems.length,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getAtRiskItems:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get Scope Changes
 * 
 * Business Logic per SRS v2.1:
 * - ADDED: Task NOT in baseline but currently in Sprint
 * - REMOVED: Task WAS in baseline but NOT currently in Sprint
 * - PRIORITY: Task in Sprint but Priority differs from baseline
 */
resolver.define('getScopeChanges', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
    let allIssues = await getSprintIssues(sprint.id);
    
    // Get baseline
    let baseline = await getSprintBaseline(sprint.id);
    if (!baseline) {
      // No baseline yet - create one
      await saveSprintBaseline(sprint.id, allIssues);
      baseline = await getSprintBaseline(sprint.id);
    }
    
    // Filter by assignee if specified
    let issues = allIssues;
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
    }
    
    const baselineMap = new Map(
      (baseline?.issues || []).map(b => [b.key, b])
    );
    const currentMap = new Map(
      issues.map(i => [i.key, i])
    );
    
    const added = [];
    const removed = [];
    const priorityChanged = [];
    
    // Find ADDED issues
    issues.forEach(issue => {
      if (!baselineMap.has(issue.key)) {
        added.push({
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
        });
      }
    });
    
    // Find REMOVED and PRIORITY CHANGED issues
    baseline?.issues?.forEach(baselineIssue => {
      const currentIssue = allIssues.find(i => i.key === baselineIssue.key);
      
      if (!currentIssue) {
        // Issue was REMOVED
        removed.push({
          key: baselineIssue.key,
          summary: 'Removed from sprint',
          assignee: 'N/A',
          priority: baselineIssue.priority,
          changeType: 'REMOVED',
          changeDate: new Date().toISOString(),
          originalEstimate: baselineIssue.originalEstimate,
          remainingEstimate: 0
        });
      } else {
        // Check for PRIORITY change
        const currentPriority = currentIssue.fields.priority?.name;
        if (currentPriority !== baselineIssue.priority) {
          priorityChanged.push({
            key: currentIssue.key,
            summary: currentIssue.fields.summary,
            assignee: currentIssue.fields.assignee?.displayName || 'Unassigned',
            assigneeAvatar: currentIssue.fields.assignee?.avatarUrls?.['24x24'],
            changeType: 'PRIORITY',
            changeDate: currentIssue.fields.updated,
            fromPriority: baselineIssue.priority,
            toPriority: currentPriority,
            status: currentIssue.fields.status?.name,
            originalEstimate: secondsToHours(currentIssue.fields.timeoriginalestimate),
            remainingEstimate: secondsToHours(currentIssue.fields.timeestimate)
          });
        }
      }
    });
    
    return {
      success: true,
      data: {
        added,
        removed,
        priorityChanged,
        totalAdded: added.length,
        totalRemoved: removed.length,
        totalPriorityChanged: priorityChanged.length,
        totalChanges: added.length + removed.length + priorityChanged.length,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getScopeChanges:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get Priority Items
 * 
 * Business Logic per SRS v2.1:
 * - Default: Top 5 highest-priority tasks
 * - Expand: ALL sprint tasks sorted by priority
 * - Ordered by: Priority (highest first) → Due date
 */
resolver.define('getHighPriorityItems', async ({ payload }) => {
  try {
    const { boardId, assignee, expand } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
    let issues = await getSprintIssues(sprint.id);
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
    }
    
    // Priority order mapping
    const priorityOrder = { 'Highest': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Lowest': 5 };
    const doneStatuses = ['done', 'closed', 'resolved'];
    
    // Map all issues with priority info
    const allItems = issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      assigneeAvatar: issue.fields.assignee?.avatarUrls?.['24x24'],
      priority: issue.fields.priority?.name || 'Medium',
      status: issue.fields.status?.name,
      dueDate: issue.fields.duedate,
      originalEstimate: secondsToHours(issue.fields.timeoriginalestimate),
      remainingEstimate: secondsToHours(issue.fields.timeestimate),
      timeSpent: secondsToHours(issue.fields.timespent)
    }));
    
    // Sort: Priority (Highest first) → Status (not done first) → Due Date
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
    
    // If expand mode, return ALL items; otherwise return top 5
    const displayItems = expand ? allItems : allItems.slice(0, 5);
    
    return {
      success: true,
      data: {
        items: displayItems,
        total: allItems.length,
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
    console.error('Error in getHighPriorityItems:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get Release Progress
 * 
 * Business Logic per SRS:
 * - Tracks delivery progress of planned releases within sprint scope
 * - Each release displays a progress bar
 * - Progress = Done issues / Total issues per fixVersion
 */
resolver.define('getReleaseData', async ({ payload }) => {
  try {
    const { boardId, assignee } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
    let issues = await getSprintIssues(sprint.id);
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
    }
    
    const doneStatuses = ['done', 'closed', 'resolved', 'complete'];
    
    // Aggregate issues by fixVersion
    const releaseMap = new Map();
    
    issues.forEach(issue => {
      const versions = issue.fields.fixVersions || [];
      versions.forEach(version => {
        if (!releaseMap.has(version.id)) {
          releaseMap.set(version.id, {
            id: version.id,
            name: version.name,
            description: version.description || '',
            releaseDate: version.releaseDate || null,
            released: version.released || false,
            archived: version.archived || false,
            totalIssues: 0,
            doneIssues: 0,
            totalEstimate: 0,
            doneEstimate: 0,
            issues: []
          });
        }
        
        const release = releaseMap.get(version.id);
        const status = issue.fields.status?.name?.toLowerCase() || '';
        const isDone = doneStatuses.some(s => status.includes(s));
        const estimate = secondsToHours(issue.fields.timeoriginalestimate);
        
        release.totalIssues++;
        release.totalEstimate += estimate;
        
        if (isDone) {
          release.doneIssues++;
          release.doneEstimate += estimate;
        }
        
        release.issues.push({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          priority: issue.fields.priority?.name,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          isDone,
          estimate
        });
      });
    });
    
    // Convert to array and calculate progress
    const releases = Array.from(releaseMap.values()).map(release => ({
      ...release,
      progress: release.totalIssues > 0 
        ? Math.round((release.doneIssues / release.totalIssues) * 100) 
        : 0,
      estimateProgress: release.totalEstimate > 0
        ? Math.round((release.doneEstimate / release.totalEstimate) * 100)
        : 0,
      totalEstimate: Math.round(release.totalEstimate * 10) / 10,
      doneEstimate: Math.round(release.doneEstimate * 10) / 10
    }));
    
    // Sort: unreleased first, then by release date
    releases.sort((a, b) => {
      if (a.released !== b.released) return a.released ? 1 : -1;
      const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date('9999-12-31');
      const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date('9999-12-31');
      return dateA - dateB;
    });
    
    // Count issues without any fixVersion
    const unversionedCount = issues.filter(
      issue => !issue.fields.fixVersions || issue.fields.fixVersions.length === 0
    ).length;
    
    return {
      success: true,
      data: {
        releases,
        totalReleases: releases.length,
        unversionedCount,
        sprintName: sprint.name
      }
    };
  } catch (error) {
    console.error('Error in getReleaseData:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Reset sprint baseline (useful for testing or resetting)
 */
resolver.define('resetBaseline', async ({ payload }) => {
  try {
    const { boardId } = payload;
    
    if (!boardId) {
      return { success: false, error: 'Board ID is required' };
    }
    
    const sprint = await getActiveSprint(boardId);
    if (!sprint) {
      return { success: false, error: 'No active sprint found' };
    }
    
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
