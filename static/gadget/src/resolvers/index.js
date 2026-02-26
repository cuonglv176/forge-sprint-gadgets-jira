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
  const fields = [
    'summary', 'status', 'priority', 'assignee',
    'timeoriginalestimate', 'timeestimate', 'timespent',
    'duedate', 'created', 'updated'
  ].join(',');
  
  const response = await api.asUser().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=200&fields=${fields}`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch issues: ${response.status}`);
  }
  
  const data = await response.json();
  return data.issues || [];
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
    
    // Get sprint issues
    let allIssues = await getSprintIssues(sprint.id);
    
    // Get or create baseline
    let baseline = await getSprintBaseline(sprint.id);
    if (!baseline) {
      // First time - create baseline
      await saveSprintBaseline(sprint.id, allIssues);
      baseline = await getSprintBaseline(sprint.id);
    }
    
    // Get unique assignees
    const allAssignees = [...new Set(
      allIssues
        .map(i => i.fields.assignee?.displayName)
        .filter(Boolean)
    )];
    
    // Filter by assignee if specified
    let issues = allIssues;
    let teamSize = configTeamSize || allAssignees.length || 1;
    
    if (assignee && assignee !== 'All') {
      issues = issues.filter(i => 
        i.fields.assignee?.displayName === assignee ||
        i.fields.assignee?.accountId === assignee
      );
      teamSize = 1;
      
      // Also filter baseline
      if (baseline?.issues) {
        baseline.issues = baseline.issues.filter(b => {
          const fullIssue = allIssues.find(i => i.key === b.key);
          return fullIssue?.fields.assignee?.displayName === assignee ||
                 fullIssue?.fields.assignee?.accountId === assignee;
        });
      }
    }
    
    // Calculate dates
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const workingDays = countWorkingDays(startDate, endDate);
    
    // Calculate MAX CAPACITY (for Ideal Line)
    // Formula: workingDays × 8 hours × teamSize
    // For individual member: workingDays × 8 × 1
    const maxCapacity = workingDays * HOURS_PER_DAY * teamSize;
    
    // Calculate ORIGINAL ESTIMATE from baseline (for metrics display)
    const totalOriginalEstimate = baseline?.issues?.reduce((sum, item) => 
      sum + (item.originalEstimate || 0), 0
    ) || issues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timeoriginalestimate), 0
    );
    
    // Current metrics
    const currentRemaining = issues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timeestimate), 0
    );
    
    const totalSpent = issues.reduce((sum, issue) => 
      sum + secondsToHours(issue.fields.timespent), 0
    );
    
    // Identify scope changes
    const baselineKeys = new Set(baseline?.issues?.map(i => i.key) || []);
    const currentKeys = new Set(issues.map(i => i.key));
    
    const addedIssues = issues.filter(i => {
      const created = new Date(i.fields.created);
      return created > startDate && !baselineKeys.has(i.key);
    });
    
    const removedIssues = baseline?.issues?.filter(b => !currentKeys.has(b.key)) || [];
    
    // Calculate scope totals
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
    // Ideal line starts from maxCapacity and decreases linearly to 0
    const dailyDecrease = maxCapacity / workingDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Track cumulative scope changes by date
    const scopeChangesByDate = {};
    
    // Track added issues by date
    addedIssues.forEach(issue => {
      const addedDate = new Date(issue.fields.created).toISOString().split('T')[0];
      if (!scopeChangesByDate[addedDate]) {
        scopeChangesByDate[addedDate] = { added: 0, removed: 0 };
      }
      scopeChangesByDate[addedDate].added += secondsToHours(issue.fields.timeoriginalestimate);
    });
    
    // Track removed issues - use today's date as removal date
    // (changelog data not available, so mark on today or last working day)
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
      
      // IDEAL: Based on MAX CAPACITY, decreasing linearly to 0
      const ideal = Math.max(0, maxCapacity - (dailyDecrease * workingDayCount));
      
      const dateStr = current.toISOString().split('T')[0];
      const currentDate = new Date(current);
      currentDate.setHours(0, 0, 0, 0);
      
      // Only show remaining for past/today dates
      const isPastOrToday = currentDate <= today;
      
      // Get scope changes for this date
      const scopeChange = scopeChangesByDate[dateStr] || { added: 0, removed: 0 };
      
      dataPoints.push({
        date: dateStr,
        displayDate: formatDate(dateStr),
        ideal: Math.round(ideal * 10) / 10,
        remaining: isPastOrToday ? currentRemaining : null,
        timeLogged: isPastOrToday ? totalSpent : null,
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
      });
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
 * Get High Priority Items
 * Filter: Priority = Highest OR High
 */
resolver.define('getHighPriorityItems', async ({ payload }) => {
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
    
    // Filter high priority
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
    
    // Sort: Priority (Highest first), then Status (not done first), then Due Date
    const doneStatuses = ['done', 'closed', 'resolved'];
    highPriorityItems.sort((a, b) => {
      // Priority
      const pA = a.priority === 'Highest' ? 1 : 2;
      const pB = b.priority === 'Highest' ? 1 : 2;
      if (pA !== pB) return pA - pB;
      
      // Status (not done first)
      const aIsDone = doneStatuses.some(s => a.status?.toLowerCase().includes(s));
      const bIsDone = doneStatuses.some(s => b.status?.toLowerCase().includes(s));
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
      
      // Due Date
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
