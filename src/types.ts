export type Toughness = 'easy' | 'medium' | 'hard';
export type AgeGroup = '5 to 8 years' | '8 to 12 years' | 'Teens' | 'Adults';
export type Duration = '5 minutes' | '15 minutes' | '1 hour' | 'half a day' | '1 day' | '1 week';
export type TaskStatus = 'pending' | 'completed' | 'failed' | 'abandoned';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  xp: number;
  multiplier: number;
  streak: number;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  userId: string;
  niche: string;
  toughness: Toughness;
  ageGroup: AgeGroup;
  duration: Duration;
  title: string;
  description: string;
  status: TaskStatus;
  xpEarned?: number;
  multiplierApplied?: number;
  startedAt?: string;
  completedAt?: string;
  expiresAt?: string;
}

export const NICHES = [
  'Math',
  'Study Marathon',
  'Meditation',
  'Mindfulness',
  'Gym Goals',
  'Home Workout',
  'Coding Challenge',
  'Writing Prompt',
  'Language Learning',
  'Creative Arts',
  'Custom'
];

export const DURATIONS: Duration[] = [
  '5 minutes',
  '15 minutes',
  '1 hour',
  'half a day',
  '1 day',
  '1 week'
];

export const TOUGHNESS_LEVELS: Toughness[] = ['easy', 'medium', 'hard'];

export const AGE_GROUPS: AgeGroup[] = ['5 to 8 years', '8 to 12 years', 'Teens', 'Adults'];
