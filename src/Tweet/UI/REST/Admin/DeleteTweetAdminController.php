<?php

declare(strict_types=1);

namespace Twitter\Tweet\UI\REST\Admin;

use Assert\Assert;

use function sprintf;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Cache\TagAwareCacheInterface;
use Twitter\Tweet\Domain\Tweet\Exception\TweetNotFoundException;
use Twitter\Tweet\Domain\Tweet\Model\TweetRepository;

#[Route('/api/admin/tweets/{tweetId}', name: 'api_admin_delete_tweet', methods: [Request::METHOD_DELETE])]
final readonly class DeleteTweetAdminController
{
    public function __construct(
        private TweetRepository $tweetRepository,
        private TagAwareCacheInterface $cacheTweets,
    ) {}

    /**
     * @throws TweetNotFoundException
     */
    public function __invoke(string $tweetId): Response
    {
        Assert::that($tweetId)->uuid();
        $tweet = $this->tweetRepository->getById($tweetId);
        $this->tweetRepository->remove($tweet);
        $this->cacheTweets->invalidateTags([
            'tweets_main',
            'user_tweets',
            sprintf('user_tweets_%s', $tweet->userId()),
        ]);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
