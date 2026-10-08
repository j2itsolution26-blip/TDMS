/**
 * The Diploma Instructor module's shared vocabulary and rules.
 *
 * Pure and dependency-free, so the server enforces exactly the rules the
 * screens display: a quiz's phase, a class meeting's LIVE/Completed state, a
 * final grade, an answer sheet's score. Every value here matches a CHECK
 * constraint in migration 20260929000000_diploma_instructor_module.
 */

// --- Assessments ------------------------------------------------------------------

export const ASSESSMENT_KINDS = ['QUIZ', 'EXAM', 'ACTIVITY', 'PT'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  QUIZ: 'Quiz',
  EXAM: 'Examination',
  ACTIVITY: 'Online Activity',
  PT: 'Performance Task',
};

export const ASSESSMENT_KIND_PLURALS: Record<AssessmentKind, string> = {
  QUIZ: 'Quizzes',
  EXAM: 'Examinations',
  ACTIVITY: 'Online Activities',
  PT: 'Performance Tasks',
};

export const EXAM_TYPES = ['MAJOR', 'MIDTERM', 'FINAL', 'PRACTICAL'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  MAJOR: 'Major Examination',
  MIDTERM: 'Midterm Examination',
  FINAL: 'Final Examination',
  PRACTICAL: 'Practical Examination',
};

/** DRAFT → FINALIZED → RELEASED. Students see a score only once RELEASED. */
export const SCORE_STATUSES = ['DRAFT', 'FINALIZED', 'RELEASED'] as const;
export type ScoreStatus = (typeof SCORE_STATUSES)[number];

export const SCORE_STATUS_LABELS: Record<ScoreStatus, string> = {
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  RELEASED: 'Released',
};

/**
 * What an assessment is, from the calendar and its results:
 *
 *   DRAFT      not yet published to students
 *   SCHEDULED  published, its window has not opened
 *   OPEN       inside its window (or published with no window)
 *   CLOSED     its window has ended; results not yet released
 *   PUBLISHED  results released to students
 */
export type AssessmentPhase = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'PUBLISHED';

export const ASSESSMENT_PHASE_LABELS: Record<AssessmentPhase, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  OPEN: 'Open',
  CLOSED: 'Closed',
  PUBLISHED: 'Published',
};

export function assessmentPhase(
  a: { published: boolean; opensAt: Date | string | null; closesAt: Date | string | null; scoreStatus: string },
  now: Date = new Date(),
): AssessmentPhase {
  if (a.scoreStatus === 'RELEASED') return 'PUBLISHED';
  if (!a.published) return 'DRAFT';
  const t = now.getTime();
  if (a.opensAt && t < new Date(a.opensAt).getTime()) return 'SCHEDULED';
  if (a.closesAt && t >= new Date(a.closesAt).getTime()) return 'CLOSED';
  return 'OPEN';
}

/** Whether a student may be taking this assessment online right now. */
export function isAcceptingSubmissions(
  a: { published: boolean; onlineEnabled: boolean; opensAt: Date | string | null; closesAt: Date | string | null; scoreStatus: string },
  now: Date = new Date(),
): boolean {
  return a.onlineEnabled && a.scoreStatus === 'DRAFT' && assessmentPhase(a, now) === 'OPEN';
}

/**
 * When an online attempt must be in: the earlier of the window's end and the
 * attempt's own duration. A student who starts late gets less time, never more.
 */
export function attemptDeadline(startedAt: Date, durationMinutes: number | null, closesAt: Date | null): Date | null {
  const byDuration = durationMinutes ? new Date(startedAt.getTime() + durationMinutes * 60_000) : null;
  if (byDuration && closesAt) return byDuration < closesAt ? byDuration : closesAt;
  return byDuration ?? closesAt;
}

/** Grace for network latency when a timed attempt is submitted at the bell. */
export const SUBMISSION_GRACE_MS = 60_000;

// --- Answer keys and checking ------------------------------------------------------

/** "  b " → "B". Case and spacing never cost a student a point. */
export function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** A key entry may accept alternatives, written "A|C". */
export function acceptedAnswers(key: string): string[] {
  return key.split('|').map(normalizeAnswer).filter(Boolean);
}

export interface KeyItem {
  number: number;
  answer: string;
  points: number;
}

export interface CheckResult {
  points: number;
  possible: number;
  correct: number;
  items: { number: number; given: string; correct: boolean; points: number }[];
}

export function scoreAnswers(key: KeyItem[], answers: Record<string, string>): CheckResult {
  let points = 0;
  let possible = 0;
  let correct = 0;
  const items = key
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((item) => {
      const given = normalizeAnswer(answers[String(item.number)] ?? '');
      const ok = given !== '' && acceptedAnswers(item.answer).includes(given);
      possible += item.points;
      if (ok) {
        points += item.points;
        correct += 1;
      }
      return { number: item.number, given, correct: ok, points: ok ? item.points : 0 };
    });
  return { points: round2(points), possible: round2(possible), correct, items };
}

/**
 * Fast key entry for a paper answer sheet. Two forms:
 *
 *   "ABCDA BCDDA"        one letter per item, in order (spaces ignored)
 *   "1A 2B 3 C 10 true"  numbered, for sheets with free-form answers
 */
export function parseAnswerSheet(text: string, itemCount: number): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (/\d/.test(trimmed)) {
    const out: Record<string, string> = {};
    const re = /(\d+)\s*[.):=-]?\s*([^\d\s,;]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed))) {
      const n = Number(m[1]);
      if (n >= 1 && n <= itemCount) out[String(n)] = normalizeAnswer(m[2]!);
    }
    return out;
  }
  const letters = trimmed.replace(/[\s,;]+/g, '');
  const out: Record<string, string> = {};
  for (let i = 0; i < Math.min(letters.length, itemCount); i += 1) {
    const ch = letters[i]!;
    if (ch !== '-' && ch !== '_' && ch !== '.') out[String(i + 1)] = normalizeAnswer(ch);
  }
  return out;
}

// --- Grades -----------------------------------------------------------------------

export type GradeWeights = Record<AssessmentKind, number>;

export const DEFAULT_WEIGHTS: GradeWeights = { QUIZ: 20, EXAM: 40, ACTIVITY: 20, PT: 20 };

export function readWeights(value: unknown): GradeWeights {
  const v = (value ?? {}) as Partial<Record<string, unknown>>;
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of ASSESSMENT_KINDS) {
    const n = Number(v[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

/**
 * A final grade from category totals. A category with nothing recorded yet is
 * left out and the remaining weights are scaled up — so a class that has had
 * quizzes but no exam yet shows a running grade rather than a failing one.
 * Null when nothing at all is recorded.
 */
export function computeFinalGrade(
  weights: GradeWeights,
  categories: Partial<Record<AssessmentKind, { earned: number; possible: number }>>,
): number | null {
  let weighted = 0;
  let weightUsed = 0;
  for (const k of ASSESSMENT_KINDS) {
    const c = categories[k];
    if (!c || c.possible <= 0 || weights[k] <= 0) continue;
    weighted += (c.earned / c.possible) * 100 * weights[k];
    weightUsed += weights[k];
  }
  if (weightUsed === 0) return null;
  return round2(weighted / weightUsed);
}

export type GradeRemark = 'PASSED' | 'FAILED' | 'INCOMPLETE';

export function gradeRemark(percent: number | null, passing: number): GradeRemark {
  if (percent === null) return 'INCOMPLETE';
  return percent >= passing ? 'PASSED' : 'FAILED';
}

export const GRADE_REMARK_LABELS: Record<GradeRemark, string> = {
  PASSED: 'Passed',
  FAILED: 'Failed',
  INCOMPLETE: 'Incomplete',
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Attendance -------------------------------------------------------------------

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  EXCUSED: 'Excused',
};

/** "08:00" → 480. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "13:05" → "1:05 PM". */
export function formatClock(time: string): string {
  const total = timeToMinutes(time);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export type MeetingState = 'UPCOMING' | 'LIVE' | 'COMPLETED';

export function meetingState(startTime: string, endTime: string, nowMinutes: number): MeetingState {
  if (nowMinutes < timeToMinutes(startTime)) return 'UPCOMING';
  if (nowMinutes < timeToMinutes(endTime)) return 'LIVE';
  return 'COMPLETED';
}

/** PRESENT or LATE, from when the student arrived against when class began. */
export function arrivalStatus(startTime: string, lateAfterMinutes: number, arrivalMinutes: number): 'PRESENT' | 'LATE' {
  return arrivalMinutes > timeToMinutes(startTime) + lateAfterMinutes ? 'LATE' : 'PRESENT';
}

/**
 * The shortest gap between a time-in and a time-out scan. A student scanned
 * twice in quick succession — the queue jostled, the camera caught the card
 * again — is told they are already in, not clocked out.
 */
export const MIN_TIME_OUT_GAP_MS = 2 * 60_000;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const SEMESTER_LABELS: Record<number, string> = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer' };

export function yearLevelLabel(level: number): string {
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix} Year`;
}

// --- Badges -----------------------------------------------------------------------

export const BADGES = {
  EXCELLENT_PERFORMANCE: { label: 'Excellent Performance', emoji: '🏆' },
  OUTSTANDING_ATTENDANCE: { label: 'Outstanding Attendance', emoji: '⭐' },
  ASSESSMENT_ACHIEVEMENT: { label: 'Assessment Achievement', emoji: '🎯' },
  OUTSTANDING_ACTIVITY: { label: 'Outstanding Activity', emoji: '💡' },
  ACADEMIC_IMPROVEMENT: { label: 'Academic Improvement', emoji: '👏' },
} as const;
export type BadgeKey = keyof typeof BADGES;
export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

// --- Academic documents -----------------------------------------------------------

export const DOCUMENT_KINDS = ['LESSON_PLAN', 'TOS', 'PT'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  LESSON_PLAN: 'Lesson Plan',
  TOS: 'Table of Specifications',
  PT: 'Performance Task',
};

export const DOCUMENT_KIND_SHORT: Record<DocumentKind, string> = {
  LESSON_PLAN: 'Lesson Plans',
  TOS: 'TOS',
  PT: 'PT',
};

export const DOCUMENT_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  RETURNED: 'Returned',
};

/** An Instructor may edit a document while it is theirs to change. */
export function documentEditable(status: string): boolean {
  return status === 'DRAFT' || status === 'RETURNED';
}

/**
 * The file-upload policy. TDMS had none before this module, so it is set here
 * once: office documents, PDFs and images, up to 4 MB — under the 4.5 MB body
 * limit of a Vercel function, so an upload never fails at the platform edge.
 */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).map((e) => `.${e}`).join(',');

// --- Student status requests ------------------------------------------------------

/** What an Instructor may recommend, keyed by the students.status value it sets. */
export const REQUESTABLE_STATUSES = ['active', 'dropped', 'transferred', 'graduated', 'inactive'] as const;
export type RequestableStatus = (typeof REQUESTABLE_STATUSES)[number];

export const REQUESTABLE_STATUS_LABELS: Record<RequestableStatus, string> = {
  active: 'Active',
  dropped: 'Dropped',
  transferred: 'Transferred',
  graduated: 'Completed',
  inactive: 'Inactive',
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// --- Learning support -------------------------------------------------------------

export const INTERVENTIONS = [
  'Additional practice exercises',
  'Tutorial session',
  'Peer-assisted learning',
  'Remedial activity',
  'Additional consultation',
  'Reassessment recommendation',
] as const;

export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

// --- School calendar --------------------------------------------------------------

export const CALENDAR_TYPES = ['HOLIDAY', 'ACADEMIC', 'EXAM_PERIOD', 'ENROLLMENT', 'EVENT', 'SEMESTER'] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];
export const CALENDAR_TYPE_LABELS: Record<CalendarType, string> = {
  HOLIDAY: 'Holiday',
  ACADEMIC: 'Academic Date',
  EXAM_PERIOD: 'Examination Period',
  ENROLLMENT: 'Enrollment',
  EVENT: 'School Event',
  SEMESTER: 'Semester',
};

// --- School years -----------------------------------------------------------------

export const SCHOOL_YEAR_STATUSES = ['UPCOMING', 'ACTIVE', 'ARCHIVED'] as const;
export type SchoolYearStatus = (typeof SCHOOL_YEAR_STATUSES)[number];

/** "2026-2027" → "2027-2028". */
export function nextSchoolYearLabel(label: string): string | null {
  const m = /^(\d{4})-(\d{4})$/.exec(label);
  if (!m) return null;
  return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
}

/** "2026-2027" → "2026–2027", for display. */
export function schoolYearDisplay(label: string): string {
  return label.replace('-', '–');
}
