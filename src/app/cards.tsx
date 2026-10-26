import { CardSearchPanel } from '@/components/cards/CardSearchPanel';
import { Screen } from '@/components/ui/Screen';

export default function CardsScreen() {
  return (
    <Screen scroll={false} maxWidth={900}>
      <CardSearchPanel />
    </Screen>
  );
}
