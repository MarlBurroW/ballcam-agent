import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Visibility } from '@/lib/types';

interface VisibilityToggleProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  disabled?: boolean;
}

export function VisibilityToggle({ value, onChange, disabled }: VisibilityToggleProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Default Visibility</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as Visibility)}
        disabled={disabled}
        className="flex flex-col space-y-2"
      >
        <div className="flex items-center space-x-3">
          <RadioGroupItem value="public" id="public" />
          <Label htmlFor="public" className="flex flex-col cursor-pointer">
            <span className="font-medium">Public</span>
            <span className="text-xs text-muted-foreground">
              Anyone can view your replays
            </span>
          </Label>
        </div>
        <div className="flex items-center space-x-3">
          <RadioGroupItem value="unlisted" id="unlisted" />
          <Label htmlFor="unlisted" className="flex flex-col cursor-pointer">
            <span className="font-medium">Unlisted</span>
            <span className="text-xs text-muted-foreground">
              Only people with the link can view
            </span>
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}
