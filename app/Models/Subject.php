<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['code', 'title', 'description', 'subject_type', 'default_units', 'is_active'])]
class Subject extends Model
{
    protected function casts(): array
    {
        return [
            'default_units' => 'decimal:1',
            'is_active' => 'boolean',
        ];
    }

    public function curriculumSubjects(): HasMany
    {
        return $this->hasMany(CurriculumSubject::class);
    }
}
