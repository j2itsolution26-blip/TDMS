<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('curriculum_subjects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('curriculum_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->restrictOnDelete();
            $table->foreignId('prerequisite_subject_id')->nullable()->constrained('subjects')->nullOnDelete();
            $table->unsignedTinyInteger('year_level');
            $table->unsignedTinyInteger('semester');
            $table->decimal('units', 4, 1);
            $table->timestamps();

            $table->unique(['curriculum_id', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('curriculum_subjects');
    }
};
