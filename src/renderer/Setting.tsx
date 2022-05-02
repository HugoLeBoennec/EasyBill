const Setting = () => {
  const availableSettingList = [
    'Company name',
    'Adress',
    'ZIP',
    'City',
    'Mobile Number',
    'Legals',
  ];
  const InputList = availableSettingList.map((setting) => (
    <>
      <span>{setting}</span>
      <input type="text" id={`inp_${setting}`} />
    </>
  ));

  return (
    <div className="flex flex-col text-black">
      {InputList}
      <button type="submit" className="mt-2">
        Save
      </button>
    </div>
  );
};

export default Setting;
