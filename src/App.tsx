import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, TaskActivity, NICHES, TOUGHNESS_LEVELS, AGE_GROUPS, DURATIONS, Toughness, Duration, AgeGroup } from './types';
import { generateTask } from './services/geminiService';
import { 
  Trophy, 
  Zap, 
  Flame, 
  Timer as TimerIcon, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Pause, 
  RotateCcw,
  LogOut,
  User as UserIcon,
  Plus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md',
      secondary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md',
      outline: 'border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50',
      ghost: 'text-gray-600 hover:bg-gray-100',
      danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-md',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden', className)}>
    {children}
  </div>
);

const Timer = ({ duration, onTimeUp }: { duration: Duration; onTimeUp?: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [hasRung, setHasRung] = useState(false);

  useEffect(() => {
    const parseDuration = (d: Duration) => {
      if (d === '5 minutes') return 5 * 60;
      if (d === '15 minutes') return 15 * 60;
      if (d === '1 hour') return 60 * 60;
      if (d === 'half a day') return 12 * 60 * 60;
      if (d === '1 day') return 24 * 60 * 60;
      if (d === '1 week') return 7 * 24 * 60 * 60;
      return 0;
    };
    setTimeLeft(parseDuration(duration));
    setHasRung(false);
  }, [duration]);

  useEffect(() => {
    let interval: any;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      if (!hasRung) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.error("Audio play failed", e));
        setHasRung(true);
        if (onTimeUp) onTimeUp();
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, hasRung, onTimeUp]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className={cn(
      "flex flex-col items-center gap-4 p-6 rounded-xl transition-colors duration-500",
      timeLeft === 0 && hasRung ? "bg-rose-50 border-2 border-rose-200" : "bg-gray-50"
    )}>
      <div className={cn(
        "text-4xl font-mono font-bold tracking-tighter",
        timeLeft === 0 && hasRung ? "text-rose-600 animate-pulse" : "text-indigo-600"
      )}>
        {timeLeft === 0 && hasRung ? "TIME'S UP!" : formatTime(timeLeft)}
      </div>
      <div className="flex gap-2">
        <Button 
          variant={isActive ? 'outline' : 'primary'} 
          onClick={() => setIsActive(!isActive)}
        >
          {isActive ? <Pause size={20} /> : <Play size={20} />}
          {isActive ? 'Pause' : 'Start'}
        </Button>
        <Button variant="ghost" onClick={() => setTimeLeft(0)}>
          <RotateCcw size={20} />
        </Button>
      </div>
    </div>
  );
};

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskActivity | null>(null);
  const [history, setHistory] = useState<TaskActivity[]>([]);
  
  const [selectedNiche, setSelectedNiche] = useState(NICHES[0]);
  const [customNiche, setCustomNiche] = useState('');
  const [selectedToughness, setSelectedToughness] = useState<Toughness>('medium');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>('Adults');
  const [selectedDuration, setSelectedDuration] = useState<Duration>('15 minutes');
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setHistory([]);
      setActiveTask(null);
      return;
    }

    let active = true;
    let unsubProfile: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;

    const init = async () => {
      await ensureProfile(user);
      if (!active) return;
      unsubProfile = subscribeToProfile(user.uid);
      unsubTasks = subscribeToTasks(user.uid);
    };

    init();

    return () => {
      active = false;
      if (unsubProfile) unsubProfile();
      if (unsubTasks) unsubTasks();
    };
  }, [user]);

  const ensureProfile = async (u: User) => {
    const userRef = doc(db, 'users', u.uid);
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL,
          xp: 0,
          multiplier: 1.0,
          streak: 0,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, newProfile);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
    }
  };

  const subscribeToProfile = (uid: string) => {
    const path = `users/${uid}`;
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
  };

  const subscribeToTasks = (uid: string) => {
    const path = 'tasks';
    const q = query(collection(db, 'tasks'), where('userId', '==', uid));
    return onSnapshot(q, (snap) => {
      const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskActivity));
      const pending = tasks.find(t => t.status === 'pending');
      setActiveTask(pending || null);
      setHistory(tasks.filter(t => t.status !== 'pending').sort((a, b) => 
        new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
      ));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleGenerate = async () => {
    if (!user) return;
    const nicheToUse = selectedNiche === 'Custom' ? customNiche : selectedNiche;
    if (!nicheToUse.trim()) return;
    
    setGenerating(true);
    const path = 'tasks';
    try {
      const taskData = await generateTask(nicheToUse, selectedToughness, selectedAgeGroup, selectedDuration);
      await addDoc(collection(db, path), {
        ...taskData,
        userId: user.uid,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setGenerating(false);
    }
  };

  const completeTask = async (status: 'completed' | 'failed' | 'abandoned') => {
    if (!activeTask || !profile || !user) return;
    
    const xpBase = { easy: 50, medium: 150, hard: 400 }[activeTask.toughness];
    const xpEarned = status === 'completed' ? Math.round(xpBase * profile.multiplier) : 0;
    
    // Multiplier increases on failure, stays same on abandon, resets on success
    let newMultiplier = profile.multiplier;
    if (status === 'failed') {
      newMultiplier = Math.min(profile.multiplier * 1.5, 10);
    } else if (status === 'completed') {
      newMultiplier = 1.0;
    }
    
    const taskPath = `tasks/${activeTask.id}`;
    const userPath = `users/${user.uid}`;
    
    try {
      const taskRef = doc(db, 'tasks', activeTask.id);
      await updateDoc(taskRef, {
        status,
        xpEarned,
        multiplierApplied: profile.multiplier,
        completedAt: new Date().toISOString(),
      });

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        xp: profile.xp + xpEarned,
        multiplier: newMultiplier,
        streak: status === 'completed' ? profile.streak + 1 : 0,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${taskPath} or ${userPath}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Target size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-indigo-950">ToughTask AI</h1>
          </div>
          
          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full border border-indigo-100">
                <Zap size={16} className="text-indigo-600 fill-indigo-600" />
                <span className="text-sm font-bold text-indigo-700">{profile?.xp} XP</span>
              </div>
              <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-rose-600 transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <Button onClick={handleLogin}>
              <UserIcon size={18} />
              Sign In
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md"
            >
              <h2 className="text-4xl font-extrabold text-indigo-950 mb-4 tracking-tight">
                ToughTask AI: Embrace the Challenge.
              </h2>
              <p className="text-gray-600 mb-8 text-lg">
                Generate AI-powered tasks tailored to your goals. Earn XP for completion, or gain multipliers on failure.
              </p>
              <Button onClick={handleLogin} className="w-full py-4 text-lg">
                Get Started with Google
              </Button>
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Stats & Profile */}
            <div className="space-y-6">
              <Card className="p-6 bg-gradient-to-br from-indigo-600 to-violet-700 text-white border-none">
                <div className="flex items-center gap-4 mb-6">
                  <img 
                    src={profile?.photoURL || 'https://picsum.photos/seed/user/100/100'} 
                    alt="Profile" 
                    className="w-16 h-16 rounded-2xl border-4 border-white/20"
                  />
                  <div>
                    <h3 className="font-bold text-xl">{profile?.displayName}</h3>
                    <p className="text-indigo-100 text-sm opacity-80">Level {Math.floor((profile?.xp || 0) / 1000) + 1}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-1 text-indigo-100">
                      <Zap size={14} />
                      <span className="text-xs font-bold uppercase tracking-wider">Multiplier</span>
                    </div>
                    <div className="text-2xl font-black">x{profile?.multiplier.toFixed(1)}</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-1 text-indigo-100">
                      <Flame size={14} />
                      <span className="text-xs font-bold uppercase tracking-wider">Streak</span>
                    </div>
                    <div className="text-2xl font-black">{profile?.streak}d</div>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Trophy size={18} className="text-amber-500" />
                  Recent Achievements
                </h3>
                <div className="space-y-4">
                  {history.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No tasks completed yet.</p>
                  ) : (
                    <>
                      <div className="space-y-4">
                        {(showAllHistory ? history : history.slice(0, 5)).map(task => (
                          <div key={task.id} className="flex items-center justify-between text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-700 truncate max-w-[150px]">{task.title}</span>
                              <span className="text-xs text-gray-400">{task.niche} • {task.toughness} • {task.ageGroup}</span>
                            </div>
                            <div className={cn(
                              "font-bold",
                              task.status === 'completed' ? "text-emerald-600" : task.status === 'abandoned' ? "text-gray-500" : "text-rose-600"
                            )}>
                              {task.status === 'completed' ? `+${task.xpEarned} XP` : task.status === 'abandoned' ? 'ABANDONED' : 'FAILED'}
                            </div>
                          </div>
                        ))}
                      </div>
                      {history.length > 5 && (
                        <Button 
                          variant="ghost" 
                          className="w-full mt-4 text-xs h-8" 
                          onClick={() => setShowAllHistory(!showAllHistory)}
                        >
                          {showAllHistory ? 'See less' : 'See more'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </div>

            {/* Middle Column: Active Task / Generator */}
            <div className="lg:col-span-2 space-y-6">
              <AnimatePresence mode="wait">
                {activeTask ? (
                  <motion.div
                    key="active-task"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Button 
                      variant="ghost" 
                      onClick={() => setActiveTask(null)} 
                      className="mb-4 -ml-2 text-gray-500 hover:text-indigo-600 transition-colors"
                    >
                      <ChevronLeft size={20} />
                      Go Back
                    </Button>
                    <Card className="p-8 border-2 border-indigo-100">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-wider">
                            Active Task: {activeTask.niche}
                          </span>
                          <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold uppercase tracking-wider">
                            Age: {activeTask.ageGroup}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: activeTask.toughness === 'easy' ? 1 : activeTask.toughness === 'medium' ? 2 : 3 }).map((_, i) => (
                            <Zap key={i} size={16} fill="currentColor" />
                          ))}
                        </div>
                      </div>

                      <h2 className="text-3xl font-black text-indigo-950 mb-4 leading-tight">
                        {activeTask.title}
                      </h2>
                      <p className="text-gray-600 text-lg mb-8 leading-relaxed">
                        {activeTask.description}
                      </p>

                      <Timer 
                        duration={activeTask.duration} 
                      />

                      <div className="grid grid-cols-2 gap-4 mt-8">
                        <Button 
                          variant="secondary" 
                          className="h-14 text-lg"
                          onClick={() => completeTask('completed')}
                        >
                          <CheckCircle2 size={24} />
                          I Did It!
                        </Button>
                        <Button 
                          variant="danger" 
                          className="h-14 text-lg"
                          onClick={() => completeTask('failed')}
                        >
                          <XCircle size={24} />
                          I failed
                        </Button>
                      </div>
                      <Button 
                        variant="ghost" 
                        className="w-full mt-4 h-12 text-gray-500 hover:text-rose-600"
                        onClick={() => completeTask('abandoned')}
                      >
                        <LogOut size={20} />
                        Exit Task (Abandon)
                      </Button>
                    </Card>
                  </motion.div>
                ) : (
                  <motion.div
                    key="generator"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <Card className="p-8 bg-indigo-900 text-white border-none">
                      <h2 className="text-2xl font-bold mb-4">Master Any Skill with AI</h2>
                      <p className="text-indigo-100 mb-6 leading-relaxed">
                        ToughTask uses Gemini AI to generate personalized, time-boxed challenges 
                        tailored to your niche and skill level. Level up your real-world skills 
                        through consistent practice.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-start gap-2">
                          <div className="p-1 bg-indigo-800 rounded-lg mt-0.5"><Zap size={14} /></div>
                          <span>Pick a niche and difficulty</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="p-1 bg-indigo-800 rounded-lg mt-0.5"><TimerIcon size={14} /></div>
                          <span>Complete the AI-generated task</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="p-1 bg-indigo-800 rounded-lg mt-0.5"><Trophy size={14} /></div>
                          <span>Earn XP and build your streak</span>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-8">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                          <Plus size={24} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-indigo-950">New Challenge</h2>
                          <p className="text-gray-500">Configure your next activity</p>
                        </div>
                      </div>

                      <div className="space-y-8">
                        {/* Niche Selection */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Select Niche</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {NICHES.map(n => (
                              <button
                                key={n}
                                onClick={() => setSelectedNiche(n)}
                                className={cn(
                                  "px-4 py-3 rounded-xl text-sm font-medium transition-all border-2",
                                  selectedNiche === n 
                                    ? "border-indigo-600 bg-indigo-50 text-indigo-700" 
                                    : "border-gray-100 hover:border-indigo-200 text-gray-600"
                                )}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>

                        {selectedNiche === 'Custom' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="space-y-3"
                          >
                            <label className="block text-sm font-bold text-gray-700 uppercase tracking-wider">Enter Custom Niche</label>
                            <input 
                              type="text"
                              value={customNiche}
                              onChange={(e) => setCustomNiche(e.target.value)}
                              placeholder="e.g. Rocket Science, Origami, Gardening..."
                              className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-indigo-600 focus:outline-none transition-all"
                            />
                          </motion.div>
                        )}

                        {/* Age Group Selection */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Age Group</label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {AGE_GROUPS.map(ag => (
                              <button
                                key={ag}
                                onClick={() => setSelectedAgeGroup(ag)}
                                className={cn(
                                  "px-4 py-3 rounded-xl text-sm font-bold transition-all border-2",
                                  selectedAgeGroup === ag 
                                    ? "border-indigo-600 bg-indigo-50 text-indigo-700" 
                                    : "border-gray-100 hover:border-indigo-200 text-gray-600"
                                )}
                              >
                                {ag}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Toughness Slider-like buttons */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Toughness Level</label>
                          <div className="flex p-1 bg-gray-100 rounded-2xl">
                            {TOUGHNESS_LEVELS.map(t => (
                              <button
                                key={t}
                                onClick={() => setSelectedToughness(t)}
                                className={cn(
                                  "flex-1 py-3 rounded-xl text-sm font-bold capitalize transition-all",
                                  selectedToughness === t 
                                    ? "bg-white text-indigo-600 shadow-sm" 
                                    : "text-gray-500 hover:text-gray-700"
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Duration Selection */}
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Duration</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {DURATIONS.map(d => (
                              <button
                                key={d}
                                onClick={() => setSelectedDuration(d)}
                                className={cn(
                                  "px-4 py-3 rounded-xl text-sm font-medium transition-all border-2",
                                  selectedDuration === d 
                                    ? "border-indigo-600 bg-indigo-50 text-indigo-700" 
                                    : "border-gray-100 hover:border-indigo-200 text-gray-600"
                                )}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Button 
                          className="w-full h-16 text-xl mt-4" 
                          onClick={handleGenerate}
                          disabled={generating}
                        >
                          {generating ? (
                            <>
                              <Loader2 className="animate-spin" size={24} />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Zap size={24} />
                              Generate Task
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-gray-100 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
            <Target size={18} />
          </div>
          <span className="font-bold text-gray-900">ToughTask AI</span>
        </div>
        <p className="text-gray-400 text-sm">
          Challenge yourself. Grow stronger. Repeat.
        </p>
      </footer>
    </div>
  );
}
