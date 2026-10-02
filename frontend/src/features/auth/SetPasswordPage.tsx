import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Display';
import { Field, FormError, Input } from '@/components/ui/Form';
import { ApiError, authApi, getData } from '@/lib/api';
import type { AccountTokenPreview } from '@/types/api';

import { AuthLayout } from './AuthLayout';
import { newPasswordSchema, PASSWORD_HINT } from './passwordSchema';
import { useAuth } from './useAuth';

const schema = z
  .object({ password: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });
type Values = z.infer<typeof schema>;

/** Landing page for invitation and password-reset links. */
export default function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { acceptSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['account-token', token],
    queryFn: () => getData<AccountTokenPreview>(`/auth/account-tokens/${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      acceptSession(await authApi.setPassword(token, password));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Could not set your password.');
    }
  });

  if (!token || preview.isError) {
    return (
      <AuthLayout>
        <EmptyState
          icon={TriangleAlert}
          title="This link is invalid or has expired"
          description="Invitation and reset links can only be used once. Ask an officer to send you a new one."
          action={<ButtonLink to="/login" variant="secondary">Go to sign in</ButtonLink>}
        />
      </AuthLayout>
    );
  }

  if (preview.isLoading || !preview.data) {
    return (
      <AuthLayout>
        <Spinner />
      </AuthLayout>
    );
  }

  const invitation = preview.data.type === 'INVITATION';

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-bold tracking-tight">{invitation ? `Welcome, ${preview.data.firstName}!` : 'Reset your password'}</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {invitation ? 'Set a password to activate your account' : 'Choose a new password for'} <strong className="text-fg">{preview.data.email}</strong>.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <FormError message={formError} />
        <input type="email" autoComplete="username" value={preview.data.email} readOnly hidden />
        <Field label="New password" hint={PASSWORD_HINT} error={errors.password?.message}>
          {(field) => <Input {...field} type="password" autoComplete="new-password" autoFocus {...register('password')} />}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {(field) => <Input {...field} type="password" autoComplete="new-password" {...register('confirm')} />}
        </Field>
        <Button type="submit" className="w-full" icon={KeyRound} loading={isSubmitting}>
          {invitation ? 'Activate account' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
