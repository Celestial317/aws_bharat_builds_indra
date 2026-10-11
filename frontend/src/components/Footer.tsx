import { useTheme } from '../contexts/ThemeContext';
import { Mail, Phone, MapPin } from 'lucide-react';

export function Footer() {
  const { colors } = useTheme();

  return (
    <footer
      className="mt-auto py-8 transition-colors duration-300"
      style={{ backgroundColor: colors.primary }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-white">
          <div>
            <h3 className="text-lg font-bold mb-3">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#about" className="hover:opacity-80 transition-opacity">
                  About Us
                </a>
              </li>
              <li>
                <a href="#resources" className="hover:opacity-80 transition-opacity">
                  Resources
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:opacity-80 transition-opacity">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#privacy" className="hover:opacity-80 transition-opacity">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-3">Contact Us</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center space-x-2">
                <Mail className="w-4 h-4" />
                <span>info@indra.gov.in</span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="w-4 h-4" />
                <span>1800-123-4567</span>
              </li>
              <li className="flex items-center space-x-2">
                <MapPin className="w-4 h-4" />
                <span>New Delhi, India</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-3">About INDRA</h3>
            <p className="text-sm opacity-90">
              Initiative for National Drainage and Rainwater Acquisition is dedicated to
              promoting sustainable water management practices across urban and rural India.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/20 text-center text-sm text-white/90">
          <p>&copy; 2024 INDRA. All rights reserved. Government of India Initiative.</p>
        </div>
      </div>
    </footer>
  );
}
