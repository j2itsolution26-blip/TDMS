<?php

namespace App\Policies;

use App\Models\CurriculumSubject;
use App\Models\User;

class CurriculumSubjectPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'director', 'coordinator', 'secretary', 'teacher']);
    }

    public function view(User $user, CurriculumSubject $curriculumSubject): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $user->can('subjects.manage');
    }

    public function update(User $user, CurriculumSubject $curriculumSubject): bool
    {
        return $user->can('subjects.manage');
    }

    public function delete(User $user, CurriculumSubject $curriculumSubject): bool
    {
        return $user->can('subjects.manage');
    }
}
