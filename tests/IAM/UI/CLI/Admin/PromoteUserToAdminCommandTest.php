<?php

declare(strict_types=1);

namespace Twitter\Tests\IAM\UI\CLI\Admin;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;
use Twitter\IAM\Domain\User\Model\Email;
use Twitter\IAM\Domain\User\Model\PasswordHash;
use Twitter\IAM\Domain\User\Model\User;
use Twitter\IAM\Domain\User\Model\UserRepository;
use Twitter\IAM\UI\CLI\Admin\PromoteUserToAdminCommand;

#[Group('unit')]
#[CoversClass(PromoteUserToAdminCommand::class)]
final class PromoteUserToAdminCommandTest extends TestCase
{
    #[Test]
    public function returnsFailureWhenUserIsNotFound(): void
    {
        $userRepository = $this->createMock(UserRepository::class);
        $userRepository
            ->expects(self::once())
            ->method('findByEmail')
            ->with('missing@example.com')
            ->willReturn(null);
        $userRepository
            ->expects(self::never())
            ->method('flush');
        $tester = new CommandTester(new PromoteUserToAdminCommand($userRepository));

        $exitCode = $tester->execute(['email' => 'missing@example.com']);

        self::assertSame(Command::FAILURE, $exitCode, 'Command did not fail when user email was missing');
    }

    #[Test]
    public function promotesExistingUserAndReturnsSuccess(): void
    {
        $user = User::create(
            Email::fromString('admin@example.com'),
            PasswordHash::fromPlainPassword('Pswd.123'),
        );
        $userRepository = $this->createMock(UserRepository::class);
        $userRepository
            ->expects(self::once())
            ->method('findByEmail')
            ->with('admin@example.com')
            ->willReturn($user);
        $userRepository
            ->expects(self::once())
            ->method('flush');
        $tester = new CommandTester(new PromoteUserToAdminCommand($userRepository));

        $exitCode = $tester->execute(['email' => 'admin@example.com']);

        self::assertSame(Command::SUCCESS, $exitCode, 'Command did not succeed when promoting existing user');
    }

    #[Test]
    public function grantsRoleAdminToFoundUser(): void
    {
        $user = User::create(
            Email::fromString('admin@example.com'),
            PasswordHash::fromPlainPassword('Pswd.123'),
        );
        $userRepository = $this->createStub(UserRepository::class);
        $userRepository
            ->method('findByEmail')
            ->willReturn($user);
        $tester = new CommandTester(new PromoteUserToAdminCommand($userRepository));

        $tester->execute(['email' => 'admin@example.com']);

        self::assertContains('ROLE_ADMIN', $user->getRoles(), 'Command did not add ROLE_ADMIN to user roles');
    }
}
