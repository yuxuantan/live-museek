const Popup: React.FC<{ isOpen: boolean, onClose: () => void, children: React.ReactNode }> = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;
  
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black opacity-50" onClick={onClose}></div>
        <div className="relative z-10 bg-white p-8 rounded-lg shadow-lg md:w-1/2 w-11/12">
          {children}
          <button onClick={onClose} className="absolute top-2 right-2 text-xl font-bold text-gray-700">&times;</button>
        </div>
      </div>
    );
  };
  
  export default Popup;
  