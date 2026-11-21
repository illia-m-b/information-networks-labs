<?php

declare(strict_types=1);

namespace Twitter\Tests\Shared\UI\Web\ApiDocs;

use function dirname;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Twitter\Shared\UI\Web\ApiDocs\ApiDocsController;

#[Group('unit')]
#[CoversClass(ApiDocsController::class)]
final class ApiDocsControllerTest extends TestCase
{
    #[Test]
    public function specReturnsOkStatusCode(): void
    {
        $controller = new ApiDocsController(dirname(__DIR__, 5));

        $response = $controller->spec();

        self::assertSame(Response::HTTP_OK, $response->getStatusCode(), 'OpenAPI spec endpoint did not return HTTP 200');
    }

    #[Test]
    public function specReturnsYamlContentTypeHeader(): void
    {
        $controller = new ApiDocsController(dirname(__DIR__, 5));

        $response = $controller->spec();

        self::assertSame('application/yaml; charset=utf-8', $response->headers->get('Content-Type'), 'OpenAPI spec response did not return YAML content type');
    }

    #[Test]
    public function specReturnsOpenApiDocumentBody(): void
    {
        $controller = new ApiDocsController(dirname(__DIR__, 5));

        $response = $controller->spec();

        self::assertStringContainsString('openapi: 3.0.3', (string) $response->getContent(), 'OpenAPI spec body did not include expected OpenAPI version');
    }

    #[Test]
    public function specThrowsNotFoundWhenSpecFileIsMissing(): void
    {
        $controller = new ApiDocsController(dirname(__DIR__, 5).'/nonexistent-dir');

        $this->expectException(NotFoundHttpException::class);

        $controller->spec();
    }
}
