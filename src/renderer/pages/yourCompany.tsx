/* eslint-disable jsx-a11y/label-has-associated-control */
import {
  InputText,
  InputDate,
  InputRadio,
  InputBase,
  InputToggle,
} from '../components/inputs';

const yourCompanyPage = () => {
  return (
    <>
      <InputBase label="Siret" id="l1">
        <InputText id="t1" type="text" placeholder="12345678900012" />
      </InputBase>
      <InputBase label="NAF ou APE" id="l2">
        <InputText
          id="t2"
          type="text"
          placeholder=" 58.29, 68.01Z, 62.02A..."
        />
      </InputBase>
      <InputBase label="Date d'immatricutaltion" id="l3">
        <InputDate id="d3" type="date" />
      </InputBase>
      <div id="l4">
        <span className="sm:text-sm text-black font-bold">
          Périodicité du Compte
        </span>
        <div>
          <InputRadio id="C1" value="month" name="l4" />
          <label htmlFor="C1" className="pl-2">
            Mensuel au 30
          </label>
        </div>
        <div>
          <InputRadio id="C2" value="tri" name="l4" />
          <label htmlFor="C2" className="pl-2">
            Trimestielle au 30
          </label>
        </div>
      </div>
      <InputBase label="Versement libératoire de l'impôt sur le revenu" id="l5">
        <InputToggle id="test" />
      </InputBase>
    </>
  );
};

export default yourCompanyPage;
