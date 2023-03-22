import { useContext } from 'react';
import { LocaleContext } from './LocaleContext';

import PieComp from './rechartComp/PieComp';

import fr from './locales/fr';
import en from './locales/en';

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
  const locale = useContext(LocaleContext);
  const c = locale === 'fr' ? fr.common : en.common;
  const t = locale === 'fr' ? fr.dashboardPage : en.dashboardPage;

  return (
    <div className="flex flex-col justify-start pt-3">
      <div className="flex flex-row justify-between">
        <Card title={t.revenue} subtitle="Sur 50j" data="50 M€" />
        <Card title={t.revenue} subtitle="Sur 100j" data="200 M€" />
      </div>
      <Card title={t.revenue} subtitle="Sur 100j" data="200 M€" />
      <PieComp />
    </div>
  );
};

export default Dashboard;
