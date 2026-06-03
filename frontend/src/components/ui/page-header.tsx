interface PageHeaderProps {
  title: string;
  description?: string;
}

export const PageHeader = ({ title, description }: PageHeaderProps) => (
  <div>
    <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
    {description ? <p className="text-gray-500 mt-1 text-sm">{description}</p> : null}
  </div>
);
