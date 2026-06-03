interface EmptyStateProps {
  message: string;
}

export const EmptyState = ({ message }: EmptyStateProps) => (
  <p className="text-sm text-gray-400 text-center py-8">{message}</p>
);
