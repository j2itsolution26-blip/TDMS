<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('curricula', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->constrained()->restrictOnDelete();
            $table->string('version_label');
            $table->string('effective_school_year');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['program_id', 'version_label']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('curricula');
    }
};
