<?php

declare(strict_types=1);

namespace Twitter\IAM\Domain\User\Model;

interface UserRepository
{
    public function add(User $user): void;

    public function findByEmail(string $email): ?User;

    public function flush(): void;
}
