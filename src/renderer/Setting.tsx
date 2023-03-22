import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { LocaleContext } from './LocaleContext';
import { InputText, InputBase } from './components/inputs';

import fr from './locales/fr';
import en from './locales/en';

const toId = (text: string) => {
  return text.toLocaleLowerCase().replaceAll(' ', '');
};

const Setting = () => {
  const locale = useContext(LocaleContext);
  const c = locale === 'fr' ? fr.common : en.common;
  const t = locale === 'fr' ? fr.settingPage : en.settingPage;

  return (
    <div className="flex flex-col text-black">
      <InputBase label={t.company} id={`inp_${toId(t.company)}_base`}>
        <InputText
          id={`inp_${toId(t.company)}`}
          type="text"
          placeholder="Google"
        />
      </InputBase>
      <Link to="./company">⚙️ Company Setting</Link>
      <InputBase label={t.address} id={`inp_${toId(t.address)}_base`}>
        <InputText
          id={`inp_${toId(t.address)}`}
          type="text"
          placeholder="42 rue de la vérité"
        />
      </InputBase>
      <InputBase label={t.zip} id={`inp_${toId(t.zip)}_base`}>
        <InputText id={`inp_${toId(t.zip)}`} type="text" placeholder="75000" />
      </InputBase>
      <InputBase label={t.city} id={`inp_${toId(t.city)}_base`}>
        <InputText id={`inp_${toId(t.city)}`} type="text" placeholder="Paris" />
      </InputBase>
      <InputBase label={t.phone} id={`inp_${toId(t.phone)}_base`}>
        <InputText
          id={`inp_${toId(t.phone)}`}
          type="text"
          placeholder="0601020304"
        />
      </InputBase>
      <InputBase label={t.legal} id={`inp_${toId(t.legal)}_base`}>
        <InputText id={`inp_${toId(t.legal)}`} type="text" />
      </InputBase>
      <button type="submit" className="mt-2">
        Save
      </button>
    </div>
  );
};

export default Setting;
