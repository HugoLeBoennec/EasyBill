import {
  MemoryRouter as Router,
  Routes,
  Route,
  Outlet,
  NavLink,
  useLocation,
} from 'react-router-dom';
import Setting from './Setting';
import DashboardNew from './DashboardNew';
import Company from './pages/yourCompany';
import EInvoicing from './EInvoicing';
import Invoices from './Invoices';
import InvoiceForm from './InvoiceForm';
import Customers from './Customers';
import Dev from './Devtest';
// import 'tailwindcss/tailwind.css';
import './App.css';
import { LocaleProvider } from './LocaleContext';

const Navbar = () => {
  const navLink = ['Dashboard', 'Invoices', 'Customers', 'Setting', 'Test'];
  const navs = navLink.map((name) => (
    <NavLink
      key={name}
      className={({ isActive }) =>
        `py-3 px-2 mx-1 transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`
      }
      to={`/${name.toLowerCase()}`}
    >
      {name}
    </NavLink>
  ));
  return (
    <div className="flex flex-col justify-start w-1/5 bg-gray-800 h-screen">
      <div className="p-4 text-white font-bold text-xl border-b border-gray-700">
        EasyBill
      </div>
      {navs}
    </div>
  );
};

const Base = () => {
  return (
    <div className="flex h-screen">
      <Navbar />
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
};

export default function App() {
  const countryCode = navigator.language;

  return (
    <Router>
      <LocaleProvider locale={countryCode}>
        <Routes>
          <Route path="/" element={<Base />}>
            <Route index element={<DashboardNew />} />
            <Route path="test" element={<Dev />} />
            <Route path="dashboard" element={<DashboardNew />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/new" element={<InvoiceForm />} />
            <Route path="customers" element={<Customers />} />
            <Route path="setting" element={<Setting />} />
            <Route path="setting/company" element={<Company />} />
            <Route path="setting/einvoicing" element={<EInvoicing />} />
          </Route>
        </Routes>
      </LocaleProvider>
    </Router>
  );
}
