<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Every test gets a fresh database seeded with roles and permissions
     * (via DatabaseSeeder) — real system configuration that RBAC-gated
     * feature tests depend on, not demo data.
     */
    protected $seed = true;
}
