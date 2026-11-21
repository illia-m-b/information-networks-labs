<?php

declare(strict_types=1);

namespace Twitter\Shared\UI\Web\About;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class AboutController extends AbstractController
{
    #[Route('/about', name: 'about', methods: ['GET'])]
    public function __invoke(): Response
    {
        return $this->render('page/about.html.twig');
    }
}
