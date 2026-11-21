<?php

declare(strict_types=1);

namespace Twitter\IAM\UI\CLI\Admin;

use function sprintf;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Twitter\IAM\Domain\User\Model\UserRepository;

#[AsCommand(
    name: 'app:user:promote-admin',
    description: 'Grant ROLE_ADMIN to an existing user by email',
)]
final class PromoteUserToAdminCommand extends Command
{
    public function __construct(
        private readonly UserRepository $userRepository,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('email', InputArgument::REQUIRED, 'User email address');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $email = (string) $input->getArgument('email');
        $user = $this->userRepository->findByEmail($email);
        if (null === $user) {
            $output->writeln(sprintf('<error>User with email "%s" not found</error>', $email));

            return Command::FAILURE;
        }

        $user->promoteToAdmin();
        $this->userRepository->flush();
        $output->writeln(sprintf('<info>User "%s" promoted to ROLE_ADMIN</info>', $email));

        return Command::SUCCESS;
    }
}
