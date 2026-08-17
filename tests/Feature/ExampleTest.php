<?php

it('redirects the root URL to the dashboard', function () {
    $response = $this->get('/');

    $response->assertRedirect('/dashboard');
});
