<?php

declare(strict_types=1);

namespace Twitter\Shared\UI\Web\VueApp;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class VueAppController extends AbstractController
{
    #[Route('/app', name: 'vue_app', methods: ['GET'])]
    public function __invoke(): Response
    {
        return $this->render('page/vue_app.html.twig');
    }
}
