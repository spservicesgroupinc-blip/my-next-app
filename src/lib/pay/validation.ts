/**
 * Validation Utilities for Pay Operations
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate manual time entry data
 */
export function validateManualTimeEntry(data: {
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
}): ValidationResult {
  const errors: string[] = [];

  // Validate work date
  if (!data.work_date) {
    errors.push('Work date is required');
  } else {
    const workDate = new Date(data.work_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Don't allow future dates
    if (workDate > today) {
      errors.push('Work date cannot be in the future');
    }
  }

  // Validate start time
  if (!data.start_time) {
    errors.push('Start time is required');
  } else if (!isValidTime(data.start_time)) {
    errors.push('Invalid start time format');
  }

  // Validate end time
  if (!data.end_time) {
    errors.push('End time is required');
  } else if (!isValidTime(data.end_time)) {
    errors.push('Invalid end time format');
  }

  // Validate end time is after start time (with overnight handling)
  if (data.start_time && data.end_time) {
    const start = timeToMinutes(data.start_time);
    let end = timeToMinutes(data.end_time);
    
    // Handle overnight shifts
    if (end < start) {
      end += 24 * 60;
    }
    
    const duration = end - start;
    
    if (duration <= 0) {
      errors.push('End time must be after start time');
    } else if (duration > 24 * 60) {
      errors.push('Shift duration cannot exceed 24 hours');
    } else if (duration < 15) {
      errors.push('Minimum shift duration is 15 minutes');
    }
  }

  // Validate break minutes
  if (data.break_minutes < 0) {
    errors.push('Break minutes cannot be negative');
  } else if (data.break_minutes > 480) {
    errors.push('Break time cannot exceed 8 hours');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate pay period data
 */
export function validatePayPeriod(data: {
  period_start: string;
  period_end: string;
  pay_date: string;
  period_type: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate period type
  const validTypes = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
  if (!data.period_type || !validTypes.includes(data.period_type)) {
    errors.push('Invalid pay period type');
  }

  // Validate dates exist
  if (!data.period_start) {
    errors.push('Period start date is required');
  }
  if (!data.period_end) {
    errors.push('Period end date is required');
  }
  if (!data.pay_date) {
    errors.push('Pay date is required');
  }

  // Validate date relationships
  if (data.period_start && data.period_end) {
    const start = new Date(data.period_start);
    const end = new Date(data.period_end);
    
    if (end < start) {
      errors.push('Period end date must be after period start date');
    }

    // Validate period length based on type
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    
    if (data.period_type === 'weekly' && (diffDays < 6 || diffDays > 8)) {
      errors.push('Weekly period should be 7 days');
    }
    if (data.period_type === 'biweekly' && (diffDays < 13 || diffDays > 15)) {
      errors.push('Bi-weekly period should be 14 days');
    }
  }

  if (data.period_end && data.pay_date) {
    const end = new Date(data.period_end);
    const pay = new Date(data.pay_date);
    
    if (pay < end) {
      errors.push('Pay date must be on or after period end date');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate wage data
 */
export function validateWage(data: {
  hourly_rate: number;
  effective_date: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate hourly rate
  if (data.hourly_rate === undefined || data.hourly_rate === null) {
    errors.push('Hourly rate is required');
  } else if (data.hourly_rate < 0) {
    errors.push('Hourly rate cannot be negative');
  } else if (data.hourly_rate < 7.25) {
    errors.push('Hourly rate is below federal minimum wage ($7.25)');
  } else if (data.hourly_rate > 1000) {
    errors.push('Hourly rate seems unusually high');
  }

  // Validate effective date
  if (!data.effective_date) {
    errors.push('Effective date is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate payment data
 */
export function validatePayment(data: {
  amount: number;
  payment_method: string;
  reference_number?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate amount
  if (data.amount === undefined || data.amount === null) {
    errors.push('Payment amount is required');
  } else if (data.amount <= 0) {
    errors.push('Payment amount must be positive');
  }

  // Validate payment method
  const validMethods = ['direct_deposit', 'check', 'cash', 'wire_transfer', 'other'];
  if (!data.payment_method || !validMethods.includes(data.payment_method)) {
    errors.push('Invalid payment method');
  }

  // Validate reference number for certain methods
  if (data.payment_method === 'check' && !data.reference_number) {
    errors.push('Check number is required for check payments');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper: Check if string is valid time format (HH:MM)
 */
function isValidTime(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Helper: Convert time string to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Validate that a date string is valid
 */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString().split('T')[0];
}

/**
 * Validate pay record before submission
 */
export function validatePayRecordSubmission(data: {
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  hourly_rate_at_time: number;
}): ValidationResult {
  const errors: string[] = [];

  // Validate hours
  if (data.regular_hours < 0) {
    errors.push('Regular hours cannot be negative');
  }
  if (data.overtime_hours < 0) {
    errors.push('Overtime hours cannot be negative');
  }
  if (data.doubletime_hours < 0) {
    errors.push('Doubletime hours cannot be negative');
  }

  const totalHours = data.regular_hours + data.overtime_hours + data.doubletime_hours;
  if (totalHours > 168) { // Max hours in a week
    errors.push('Total hours exceed maximum (168 hours/week)');
  }

  // Validate rate
  if (data.hourly_rate_at_time < 0) {
    errors.push('Hourly rate cannot be negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
