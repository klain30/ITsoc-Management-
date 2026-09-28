import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { applyServerErrors } from '@/lib/forms';
import { MEMBERSHIP_STATUS, YEAR_LEVELS, enumOptions, yearLabel } from '@/lib/labels';
import type { AccessLink, Member } from '@/types/api';

import { useCreateMember, useUpdateMember } from './api';

const COURSES = ['BS Information Technology', 'BS Computer Science', 'BS Information Systems', 'BS Entertainment and Multimedia Computing'];

const schema = z.object({
  studentId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{3,19}$/, '4–20 letters, digits or dashes (e.g. 2024-00123).'),
  firstName: z.string().trim().min(1, 'Required.').max(80),
  middleName: z.string().trim().max(80),
  lastName: z.string().trim().min(1, 'Required.').max(80),
  email: z.string().trim().email('Enter a valid email address.'),
  course: z.string().trim().min(2, 'Required.').max(100),
  yearLevel: z.coerce.number().int().min(1).max(6),
  section: z.string().trim().max(20),
  contactNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || /^(\+639|09)\d{9}$/.test(v.replace(/[\s-]/g, '')), 'Use a PH mobile number like 09171234567.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALUMNI']),
});

type Values = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape);

const defaults = (member?: Member): Values => ({
  studentId: member?.studentId ?? '',
  firstName: member?.firstName ?? '',
  middleName: member?.middleName ?? '',
  lastName: member?.lastName ?? '',
  email: member?.email ?? '',
  course: member?.course ?? COURSES[0],
  yearLevel: member?.yearLevel ?? 1,
  section: member?.section ?? '',
  contactNumber: member?.contactNumber ?? '',
  status: member?.status ?? 'ACTIVE',
});

export function MemberFormDialog({
  open,
  onClose,
  member,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  member?: Member;
  onInvited?: (result: { member: Member; invitation: AccessLink }) => void;
}) {
  const toast = useToast();
  const create = useCreateMember();
  const update = useUpdateMember(member?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, Values>({ resolver: zodResolver(schema), defaultValues: defaults(member) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const input = { ...values, middleName: values.middleName || null, section: values.section || null, contactNumber: values.contactNumber || null };
    try {
      if (member) {
        await update.mutateAsync(input);
        toast.success('Member updated.');
      } else {
        const result = await create.mutateAsync(input);
        if (result) onInvited?.(result);
      }
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={member ? 'Edit member' : 'Add member'}
      description={member ? undefined : 'An account is created and you’ll get an invitation link to send to the member.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="member-form" loading={isSubmitting}>
            {member ? 'Save changes' : 'Add & create invite'}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormError message={formError} />
        </div>
        <Field label="First name" required error={errors.firstName?.message}>
          {(f) => <Input {...f} {...register('firstName')} autoComplete="off" />}
        </Field>
        <Field label="Last name" required error={errors.lastName?.message}>
          {(f) => <Input {...f} {...register('lastName')} autoComplete="off" />}
        </Field>
        <Field label="Middle name" error={errors.middleName?.message}>
          {(f) => <Input {...f} {...register('middleName')} autoComplete="off" />}
        </Field>
        <Field label="Student ID" required error={errors.studentId?.message}>
          {(f) => <Input {...f} {...register('studentId')} placeholder="2024-00123" autoComplete="off" />}
        </Field>
        <Field label="Email" required error={errors.email?.message} className="sm:col-span-2">
          {(f) => <Input {...f} type="email" {...register('email')} placeholder="name@students.university.edu.ph" autoComplete="off" />}
        </Field>
        <Field label="Course" required error={errors.course?.message}>
          {(f) => (
            <>
              <Input {...f} list="courses" {...register('course')} />
              <datalist id="courses">
                {COURSES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Year level" required error={errors.yearLevel?.message}>
            {(f) => (
              <Select {...f} {...register('yearLevel')}>
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>
                    {yearLabel(y)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Section" error={errors.section?.message}>
            {(f) => <Input {...f} {...register('section')} placeholder="A" />}
          </Field>
        </div>
        <Field label="Contact number" error={errors.contactNumber?.message}>
          {(f) => <Input {...f} type="tel" {...register('contactNumber')} placeholder="09171234567" />}
        </Field>
        <Field label="Membership status" required error={errors.status?.message}>
          {(f) => (
            <Select {...f} {...register('status')}>
              {enumOptions(MEMBERSHIP_STATUS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
