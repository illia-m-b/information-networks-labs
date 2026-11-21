<?php

declare(strict_types=1);

namespace Twitter\Tests\Tweet\UI\REST\Admin;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

use function sprintf;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Contracts\Cache\TagAwareCacheInterface;
use Twitter\Tweet\Domain\Tweet\Model\Tweet;
use Twitter\Tweet\Domain\Tweet\Model\TweetRepository;
use Twitter\Tweet\UI\REST\Admin\DeleteTweetAdminController;

#[Group('unit')]
#[CoversClass(DeleteTweetAdminController::class)]
final class DeleteTweetAdminControllerTest extends TestCase
{
    #[Test]
    public function removesTweetInvalidatesCacheAndReturnsNoContent(): void
    {
        $userId = '019b5f3f-d110-7908-9177-5df439942a8b';
        $tweet = Tweet::create($userId, 'Moderation target');
        $tweetRepository = $this->createMock(TweetRepository::class);
        $tweetRepository
            ->expects(self::once())
            ->method('getById')
            ->with($tweet->id())
            ->willReturn($tweet);
        $tweetRepository
            ->expects(self::once())
            ->method('remove')
            ->with($tweet);
        $cache = $this->createMock(TagAwareCacheInterface::class);
        $cache
            ->expects(self::once())
            ->method('invalidateTags')
            ->with([
                'tweets_main',
                'user_tweets',
                sprintf('user_tweets_%s', $userId),
            ])
            ->willReturn(true);
        $controller = new DeleteTweetAdminController($tweetRepository, $cache);

        $response = $controller($tweet->id());

        self::assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode(), 'Admin tweet deletion did not return HTTP 204');
    }
}
