/* eslint-disable jsx-a11y/label-has-associated-control */
import { ChangeEvent, CSSProperties, FC, ReactChild, ReactNode } from 'react';

type InputTextType =
  | 'email'
  | 'number'
  | 'password'
  | 'search'
  | 'tel'
  | 'text'
  | 'url';

type InputDateType = 'date' | 'datetime-local' | 'month' | 'week' | 'time';

type InputBaseProps = {
  children?: ReactChild;
  className?: string;
  id: string;
  label?: string;
  name?: string;
  // onBlur: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: ChangeEvent<HTMLInputElement>) => void;
  // onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  style?: CSSProperties;
  type?: InputTextType | InputDateType;
  value?: string;
};

const InputText = ({
  id,
  type,
  label,
  name,
  placeholder,
  onChange,
  value,
}: InputBaseProps) => {
  return (
    <input
      // id={id}
      // name={name}
      className="placeholder:italic placeholder:text-slate-400 hover:placeholder:text-blue-400 hover:border-blue-300 block bg-white w-full border border-slate-300 rounded-md py-2 px-3 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-sky-500 focus:ring-1 sm:text-sm"
      type={type}
      placeholder={placeholder}
      // onChange={onChange}
      // defaultValue={value}
    />
  );
};
const InputDate = ({ type }: InputBaseProps) => {
  return (
    <input
      className="placeholder:italic placeholder:text-slate-400 block bg-white w-full border border-slate-300 rounded-md py-2 px-3 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-sky-500 focus:ring-1 sm:text-sm"
      type={type}
    />
  );
};

const InputSubmit = () => {
  return <input type="submit" />;
};
const InputRange = () => {
  return (
    <input
      type="range"
      className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
    />
  );
};
const InputRadio: FC<InputBaseProps> = ({ name, id, value }) => {
  return (
    <input
      type="radio"
      id={id}
      name={name}
      value={value}
      className="w-4 h-4 appearance-none rounded-full bg-origin-border
        bg-gray-100 border-gray-300
        border
        checked:bg-blue-600 checked:border-0
        focus:bg-blue-600 focus:ring-2 focus:ring-blue-500/50 focus:ring-blue-500 focus:ring-offset-2
        dark:focus:ring-blue-600 dark:ring-offset-gray-800  dark:bg-gray-700 dark:border-gray-600"
    />
  );
};
const InputCheckBox = () => {
  return (
    <input
      type="checkbox"
      className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
    />
  );
};
const InputToggle: FC<InputBaseProps> = ({ id }) => {
  return (
    <>
      <input type="checkbox" id="default-toggle" className="sr-only peer" />
      <div
        id={id}
        className="w-11 h-6 bg-gray-200 dark:bg-gray-700
        peer-focus:outline-none
        peer-focus:ring-4
        peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800
        rounded-full
        peer-checked:after:translate-x-full
        peer-checked:after:border-white after:content-['']
        after:absolute after:top-[2px] after:left-[2px] after:bg-white
      after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"
      />
    </>
  );
};
const InputButton = () => {
  return <input type="button" />;
};
const InputColor = () => {
  return <input type="color" />;
};
const InputFile: FC<InputBaseProps> = ({ id }) => {
  return (
    <input
      type="file"
      id={id}
      className="file:bg-violet-100 file:py-2 file:px-3 file:font-semibold file:border-0 block w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
    />
  );
};

const InputFileZone = () => {
  return (
    <div className="flex justify-center items-center w-full">
      <label
        htmlFor="dropzone-file"
        className="flex flex-col justify-center items-center w-full h-64 bg-gray-50 rounded-lg border-2 border-gray-300 border-dashed cursor-pointer dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600"
      >
        <div className="flex flex-col justify-center items-center pt-5 pb-6">
          <svg
            aria-hidden="true"
            className="mb-3 w-10 h-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            SVG, PNG, JPG or GIF (MAX. 800x400px)
          </p>
        </div>
        <input id="dropzone-file" type="file" className="hidden" />
      </label>
    </div>
  );
};

const InputBase: FC<InputBaseProps> = ({ label, children, className }) => {
  return (
    <label className={className || 'relative block'}>
      <span className="sm:text-sm text-black font-bold">{label}</span>
      {children}
    </label>
  );
};

export {
  InputBase,
  InputText,
  InputSubmit,
  InputRange,
  InputRadio,
  InputCheckBox,
  InputToggle,
  InputButton,
  InputDate,
  InputColor,
  InputFile,
  InputFileZone,
};
