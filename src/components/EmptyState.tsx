interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center py-16">
      <div className="text-6xl mb-4">{icon}</div>
      <div className="text-lg opacity-50 mb-2">{title}</div>
      <div className="text-sm opacity-30">{description}</div>
    </div>
  );
}

