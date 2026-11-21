<?php

declare(strict_types=1);

namespace Twitter\IAM\UI\REST\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/stats', name: 'api_admin_stats', methods: [Request::METHOD_GET])]
final readonly class AdminStatsController
{
    public function __construct(private Connection $connection) {}

    public function __invoke(): JsonResponse
    {
        return new JsonResponse([
            'usersCount' => (int) $this->connection->fetchOne('SELECT COUNT(*) FROM users'),
            'tweetsCount' => (int) $this->connection->fetchOne('SELECT COUNT(*) FROM tweets'),
            'likesCount' => (int) $this->connection->fetchOne('SELECT COUNT(*) FROM likes'),
        ], Response::HTTP_OK);
    }
}
