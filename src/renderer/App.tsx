import {
  MemoryRouter as Router,
  Routes,
  Route,
  Outlet,
  NavLink,
  useLocation,
} from 'react-router-dom';
import Setting from './Setting';
import Billing from './Billing';
import Dashboard from './Dashboard';
import Company from './pages/yourCompany';
import Dev from './Devtest';
// import 'tailwindcss/tailwind.css';
import './App.css';
import { LocaleProvider } from './LocaleContext';

const Navbar = () => {
  const navLink = ['Dashboard', 'Billing', 'Setting', 'Test'];
  const navs = navLink.map((name) => (
    <NavLink
      className="py-3 px-2 text-white mx-1 hover:bg-slate-300 active:bg-white"
      to={`/${name.toLowerCase()}`}
    >
      {name}
    </NavLink>
  )); // bg-current
  return (
    <div className="flex flex-col justify-start w-1/5 bg-gray-800 h-screen">
      {navs}
    </div>
  );
};

const Base = () => {
  return (
    <div className="flex">
      <Navbar />
      <div className="p-5 w-full">
        <h1 className="p-2 bg-slate-900 text-white">Hello World!</h1>
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
            <Route path="test" element={<Dev />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="billing" element={<Billing />} />
            <Route path="setting" element={<Setting />} />
            <Route path="setting/company" element={<Company />} />
          </Route>
        </Routes>
      </LocaleProvider>
    </Router>
  );
}
