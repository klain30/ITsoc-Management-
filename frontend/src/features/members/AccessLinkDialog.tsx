import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Form';
import { formatDateTime } from '@/lib/format';
import type { AccessLink } from '@/types/api';

/**
 * Shows a one-time invitation / reset link. The system has no email
 * service, so the officer sends it to the member through their usual channel.
 */
export function AccessLinkDialog({ link, name, onClose }: { link: AccessLink | null; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const isReset = link?.type === 'PASSWORD_RESET';
  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog
      open={link !== null}
      onClose={close}
      title={isReset ? 'Password reset link' : 'Invitation link'}
      description={`Send this link privately to ${name}. It works once and expires ${link ? formatDateTime(link.expiresAt) : ''}.`}
      footer={<Button onClick={close}>Done</Button>}
    >
      <div className="flex gap-2">
        <Input readOnly value={link?.link ?? ''} onFocus={(e) => e.target.select()} aria-label="Link" className="font-mono text-xs" />
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={() => link && void navigator.clipboard.writeText(link.link).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        Treat this link like a password: anyone with it can {isReset ? 'reset this account’s password' : 'activate this account'}. Issuing a new link
        invalidates this one.
      </p>
    </Dialog>
  );
}
