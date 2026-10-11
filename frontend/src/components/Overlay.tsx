import { motion, AnimatePresence } from "framer-motion";
import { X, Droplets, Wrench, Info } from "lucide-react";
import { RWHComponent } from "../data/rwhData";

interface OverlayProps {
  selectedComponent: RWHComponent | null;
  onClose: () => void;
}

const Overlay = ({ selectedComponent, onClose }: OverlayProps) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute top-2 md:top-6 left-0 right-0 flex justify-center pointer-events-none px-2"
      >
        <div className="glass-card px-3 py-2 md:px-8 md:py-4">
          <h1 className="text-lg md:text-2xl lg:text-3xl font-bold text-gradient text-center">
            Interactive RWH System
          </h1>
          <p className="text-center text-gray-600 text-xs md:text-sm mt-1 hidden sm:block">
            Click on any component to learn more
          </p>
        </div>
      </motion.div>

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="absolute bottom-2 left-2 md:bottom-6 md:left-6 pointer-events-none"
      >
        <div className="glass-card px-2 py-2 md:px-4 md:py-3 max-w-xs">
          <div className="flex items-center gap-2 text-gray-600 text-xs md:text-sm">
            <Droplets className="w-3 h-3 md:w-4 md:h-4" style={{ color: '#0676c8ff' }} />
            <span className="hidden sm:inline">Drag to rotate • Scroll to zoom</span>
            <span className="sm:hidden">Drag & Zoom</span>
          </div>
        </div>
      </motion.div>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="absolute bottom-2 right-2 md:bottom-6 md:right-6 pointer-events-none hidden lg:block"
      >
        <div className="glass-card px-3 py-2 md:px-4 md:py-3">
          <h3 className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
            Components
          </h3>
          <div className="flex flex-col gap-1 text-xs md:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#3d4555]" />
              <span className="text-gray-700">Roof</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#2d9e9e]" />
              <span className="text-gray-700">Gutters</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#e6a23c]" />
              <span className="text-gray-700">Filter</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#4a7ab0]" />
              <span className="text-gray-700">Tank</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Info Card */}
      <AnimatePresence>
        {selectedComponent && (
          <motion.div
            key={selectedComponent.id}
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute bottom-0 left-0 right-0 md:top-1/2 md:right-4 lg:right-6 md:left-auto md:bottom-auto md:-translate-y-1/2 pointer-events-auto md:max-w-sm w-full md:w-96"
          >
            <div className="glass-card p-4 md:p-6 relative max-h-[50vh] md:max-h-[80vh] overflow-y-auto">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 md:top-4 md:right-4 p-1.5 md:p-2 rounded-full hover:bg-red-100 transition-colors z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Color indicator */}
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl mb-3 md:mb-4 shadow-lg"
                style={{ backgroundColor: selectedComponent.color }}
              />

              {/* Component name */}
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-3 md:mb-4 pr-8">
                {selectedComponent.name}
              </h2>

              {/* Function */}
              <div className="mb-3 md:mb-4">
                <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                  <Info className="w-3.5 h-3.5 md:w-4 md:h-4" style={{ color: '#0676c8ff' }} />
                  <h3 className="text-xs md:text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Function
                  </h3>
                </div>
                <p className="text-gray-700 text-xs md:text-sm leading-relaxed">
                  {selectedComponent.function}
                </p>
              </div>

              {/* Maintenance tip */}
              <div className="p-3 md:p-4 rounded-xl bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                  <Wrench className="w-3.5 h-3.5 md:w-4 md:h-4" style={{ color: '#32a854' }} />
                  <h3 className="text-xs md:text-sm font-semibold uppercase tracking-wide" style={{ color: '#32a854' }}>
                    Maintenance Tip
                  </h3>
                </div>
                <p className="text-gray-700 text-xs md:text-sm leading-relaxed">
                  {selectedComponent.maintenanceTip}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Overlay;
