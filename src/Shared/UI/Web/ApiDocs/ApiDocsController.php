<?php

declare(strict_types=1);

namespace Twitter\Shared\UI\Web\ApiDocs;

use function file_get_contents;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

final class ApiDocsController extends AbstractController
{
    public function __construct(private readonly string $projectDir) {}

    #[Route('/api/openapi.yaml', name: 'api_openapi_spec', methods: ['GET'])]
    public function spec(): Response
    {
        $path = $this->projectDir.'/docs/rest.yaml';
        $spec = is_file($path) ? file_get_contents($path) : false;
        if (false === $spec) {
            throw new NotFoundHttpException('OpenAPI specification not found');
        }

        return new Response($spec, Response::HTTP_OK, [
            'Content-Type' => 'application/yaml; charset=utf-8',
        ]);
    }

    #[Route('/api/docs', name: 'api_docs', methods: ['GET'])]
    public function docs(): Response
    {
        return $this->render('page/api_docs.html.twig');
    }
}
