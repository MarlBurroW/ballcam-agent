import { SetupWizard } from '@/components/SetupWizard';

interface SetupProps {
  onComplete: () => void;
}

export function Setup({ onComplete }: SetupProps) {
  return <SetupWizard onComplete={onComplete} />;
}
