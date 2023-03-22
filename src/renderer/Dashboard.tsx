import PieComp from './rechartComp/PieComp';

interface CardProps {
  title: string;
  subtitle: string;
  data: string;
}

const Card = ({ title, subtitle, data }: CardProps): JSX.Element => {
  return (
    <div className="bg-cyan-500 pb-6 flex flex-col text-center justify-between shadow m-2">
      <div className="bg-cyan-600 px-12 py-2 mb-4">
        <span>{title}</span>
      </div>
      <span className="font-bold text-lg">{data}</span>
      <span>{subtitle}</span>
    </div>
  );
};

const Dashboard = () => {
  return (
    <div className="flex flex-col justify-start pt-3">
      <div className="flex flex-row justify-between">
        <Card title="Chiffre d'affaire" subtitle="Sur 50j" data="50 M€" />
        <Card title="Chiffre d'affaire" subtitle="Sur 100j" data="200 M€" />
      </div>
      <Card title="Chiffre d'affaire" subtitle="Sur 100j" data="200 M€" />
      <PieComp />
    </div>
  );
};

export default Dashboard;
