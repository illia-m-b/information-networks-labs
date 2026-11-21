<?php

declare(strict_types=1);

namespace Twitter\Tests\Profile\UI\REST\Controller\CreateProfile;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Twitter\IAM\Domain\User\Model\Email;
use Twitter\IAM\Domain\User\Model\PasswordHash;
use Twitter\IAM\Domain\User\Model\User;
use Twitter\Profile\Application\UseCase\CreateProfile\CreateProfileCommandHandler;
use Twitter\Profile\Domain\Profile\Model\ProfileRepository;
use Twitter\Profile\UI\REST\Controller\CreateProfile\CreateProfileController;
use Twitter\Profile\UI\REST\Controller\CreateProfile\CreateProfileRequest;

#[Group('unit')]
#[CoversClass(CreateProfileController::class)]
final class CreateProfileControllerTest extends TestCase
{
    #[Test]
    public function rejectsCreatingProfileForAnotherUser(): void
    {
        $authUser = User::create(
            Email::fromString('owner@example.com'),
            PasswordHash::fromPlainPassword('Pswd.123'),
        );
        $request = new CreateProfileRequest('019b5f3f-d110-7908-9177-5df439942a8b', 'Alice', 'Bio');
        $profileRepository = $this->createMock(ProfileRepository::class);
        $profileRepository
            ->expects(self::never())
            ->method('add');
        $controller = new CreateProfileController(new CreateProfileCommandHandler($profileRepository));

        $this->expectException(AccessDeniedHttpException::class);

        $controller($request, $authUser);
    }

    #[Test]
    public function createsProfileForAuthenticatedOwner(): void
    {
        $authUser = User::create(
            Email::fromString('owner@example.com'),
            PasswordHash::fromPlainPassword('Pswd.123'),
        );
        $request = new CreateProfileRequest($authUser->id(), 'Alice', 'Bio');
        $profileRepository = $this->createMock(ProfileRepository::class);
        $profileRepository
            ->expects(self::once())
            ->method('add');
        $controller = new CreateProfileController(new CreateProfileCommandHandler($profileRepository));

        $response = $controller($request, $authUser);

        self::assertSame(Response::HTTP_CREATED, $response->getStatusCode(), 'Profile creation for authenticated owner did not return HTTP 201');
    }
}
