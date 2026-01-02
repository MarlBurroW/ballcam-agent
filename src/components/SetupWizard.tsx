import { useState } from 'react';
import { DeviceLoginFlow } from './DeviceLoginFlow';
import { LoginForm } from './LoginForm';
import { FolderDetection } from './FolderDetection';
import { GradientButton } from './ui/gradient-button';
import { AuthCard } from './ui/gradient-card';
import * as api from '@/lib/api';
import type { User } from '@/lib/types';
import { CheckCircle2 } from 'lucide-react';

type Step = 'login' | 'folder' | 'complete';
type LoginMethod = 'device' | 'password';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('login');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('device');
  const [user, setUser] = useState<User | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setStep('folder');
  };

  const handleFolderConfirm = async (folder: string) => {
    setIsCompleting(true);
    try {
      const config = await api.getConfig();
      await api.saveConfig({
        ...config,
        replayFolder: folder,
        setupComplete: true,
      });
      setStep('complete');
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full transition-colors ${step === 'login' ? 'bg-violet-500' : 'bg-violet-500/30'}`} />
            <div className="w-8 h-0.5 bg-gray-700" />
            <div className={`w-3 h-3 rounded-full transition-colors ${step === 'folder' ? 'bg-violet-500' : step === 'complete' ? 'bg-violet-500/30' : 'bg-gray-700'}`} />
            <div className="w-8 h-0.5 bg-gray-700" />
            <div className={`w-3 h-3 rounded-full transition-colors ${step === 'complete' ? 'bg-violet-500' : 'bg-gray-700'}`} />
          </div>
        </div>

        {/* Step content */}
        {step === 'login' && loginMethod === 'device' && (
          <DeviceLoginFlow
            onSuccess={handleLoginSuccess}
            onSwitchToPassword={() => setLoginMethod('password')}
          />
        )}

        {step === 'login' && loginMethod === 'password' && (
          <div className="space-y-4">
            <LoginForm onSuccess={handleLoginSuccess} />
            <p className="text-xs text-center text-gray-500">
              No password?{' '}
              <button
                onClick={() => setLoginMethod('device')}
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                Sign in with browser
              </button>
            </p>
          </div>
        )}

        {step === 'folder' && (
          <FolderDetection
            onConfirm={handleFolderConfirm}
            onBack={() => setStep('login')}
          />
        )}

        {step === 'complete' && (
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">All Set!</h1>
              <p className="text-gray-400">
                Welcome, {user?.username}! BallCam Agent is ready.
              </p>
            </div>

            <AuthCard>
              <div className="space-y-4">
                <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg text-sm">
                  <p className="font-medium text-white mb-3">What happens next:</p>
                  <ul className="space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-violet-400">•</span>
                      The app will minimize to your system tray
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-violet-400">•</span>
                      New replays will be uploaded automatically
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-violet-400">•</span>
                      You'll get a notification with each upload
                    </li>
                  </ul>
                </div>

                <GradientButton
                  onClick={handleFinish}
                  className="w-full"
                  disabled={isCompleting}
                  loading={isCompleting}
                >
                  Start Watching
                </GradientButton>
              </div>
            </AuthCard>
          </div>
        )}
      </div>
    </div>
  );
}
