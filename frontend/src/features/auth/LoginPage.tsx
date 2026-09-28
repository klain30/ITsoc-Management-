import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Field, FormError, Input } from '@/components/ui/Form';
import { ApiError } from '@/lib/api';

import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

const DEMO_ACCOUNTS = ['president', 'vp', 'secretary', 'treasurer', 'auditor', 'member'];
const DEMO_PASSWORD = 'ItsocDemo2026!';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Unable to sign in right now.');
    }
  });

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-fg-muted">Use the email address your organization invited.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Email" error={errors.email?.message}>
          {(field) => <Input {...field} type="email" autoComplete="username" autoFocus placeholder="you@university.edu.ph" {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(field) => <Input {...field} type="password" autoComplete="current-password" {...register('password')} />}
        </Field>
        <Button type="submit" className="w-full" icon={LogIn} loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-sm text-fg-muted">
        No account yet? Membership is by invitation — ask an officer to send you an invite link. Forgot your password? An officer can issue a reset
        link.
      </p>

      {import.meta.env.DEV ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong p-4">
          <p className="text-xs font-semibold text-fg-muted uppercase">Demo accounts (development only)</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account}
                type="button"
                className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-fg"
                onClick={() => {
                  setValue('email', `${account}@itsoc.test`);
                  setValue('password', DEMO_PASSWORD);
                }}
              >
                {account}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </AuthLayout>
  );
}
