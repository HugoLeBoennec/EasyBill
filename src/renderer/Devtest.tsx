/* eslint-disable jsx-a11y/label-has-associated-control */
import * as Test from './components/inputs';
import * as Tab from './components/table';

const DevTest = () => {
  return (
    <div>
      <div className="flex flex-col justify-start pt-3">
        <h2>DEVS</h2>
        <div>
          <Tab.TableBase />
        </div>
        <h3 className="mt-2">Text</h3>
        <Test.InputBase label="Text" id="1">
          <Test.InputText id="1" type="text" placeholder="Je suis un texte" />
        </Test.InputBase>
        <h3 className="mt-2">Date</h3>
        <Test.InputBase label="Date" id="2.1">
          <Test.InputText id="1" type="date" />
        </Test.InputBase>
        <Test.InputBase label="DateTime Local" id="2.2">
          <Test.InputText id="1" type="datetime-local" />
        </Test.InputBase>
        <Test.InputBase label="Month" id="2.3">
          <Test.InputText id="1" type="month" />
        </Test.InputBase>
        <Test.InputBase label="Week" id="2.4">
          <Test.InputText id="1" type="week" />
        </Test.InputBase>
        <Test.InputBase label="Time" id="2.5">
          <Test.InputText id="1" type="time" />
        </Test.InputBase>
        <h3 className="mt-2">Other</h3>
        <Test.InputBase label="Range" id="3">
          <Test.InputRange />
        </Test.InputBase>
        <fieldset>
          <Test.InputBase label="Radio" id="4.1">
            <Test.InputRadio id="C1" value="C1" name="radioTest" />
          </Test.InputBase>
          <Test.InputBase label="Radio2" id="4.2">
            <Test.InputRadio id="C2" value="C2" name="radioTest" />
          </Test.InputBase>
        </fieldset>
        <Test.InputBase label="CheckBox" id="7.1">
          <Test.InputCheckBox />
        </Test.InputBase>
        <div>
          <label
            className="inline-flex relative items-center cursor-pointer"
            htmlFor="7.2"
          >
            <Test.InputToggle id="7.2" />
            <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
              Toggle
            </span>
          </label>
        </div>
        <Test.InputBase label="Color" id="5">
          <Test.InputColor />
        </Test.InputBase>
        <div>
          <label
            className="block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300"
            htmlFor="file_input"
          >
            Upload file
          </label>
          <Test.InputFile id="file_input" />
        </div>
        <Test.InputBase label="Zone Field" id="8">
          <Test.InputFileZone />
        </Test.InputBase>
      </div>
    </div>
  );
};

export default DevTest;
