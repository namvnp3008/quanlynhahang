import React from 'react';
import { useLocation } from 'react-router-dom';
import { PlatformLayout } from '../components/platform/PlatformLayout';
import { PlatformShops } from '../components/platform/PlatformShops';
import { PlatformMerchants } from '../components/platform/PlatformMerchants';
import { PlatformRevenue } from '../components/platform/PlatformRevenue';
import { PlatformAudit } from '../components/platform/PlatformAudit';

export const PlatformPage: React.FC = () => {
  const location = useLocation();

  const isMerchants = location.pathname.startsWith('/platform/merchants');
  const isRevenue = location.pathname.startsWith('/platform/revenue');
  const isAudit = location.pathname.startsWith('/platform/audit');

  return (
    <PlatformLayout>
      {isAudit ? (
        <PlatformAudit />
      ) : isMerchants ? (
        <PlatformMerchants />
      ) : isRevenue ? (
        <PlatformRevenue />
      ) : (
        <PlatformShops />
      )}
    </PlatformLayout>
  );
};
