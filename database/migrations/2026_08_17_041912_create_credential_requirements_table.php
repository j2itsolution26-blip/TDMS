<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credential_requirements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('name');
            $table->boolean('is_required')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credential_requirements');
    }
};
