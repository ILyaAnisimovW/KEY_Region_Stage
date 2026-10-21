import { useRef, type PointerEvent, type KeyboardEvent } from 'react';

const LIMIT_X = 75;
const LIMIT_Y = 48;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export default function BakeryScene() {
  const photo = useRef<HTMLDivElement>(null);
  const position = useRef({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null);

  const move = (x: number, y: number) => {
    position.current = { x: clamp(x, LIMIT_X), y: clamp(y, LIMIT_Y) };
    photo.current?.style.setProperty('--photo-x', `${position.current.x}px`);
    photo.current?.style.setProperty('--photo-y', `${position.current.y}px`);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: position.current.x, startY: position.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('is-dragging');
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    move(active.startX + event.clientX - active.x, active.startY + event.clientY - active.y);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.classList.remove('is-dragging');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction: Record<string, [number, number]> = {
      ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
    };
    const step = direction[event.key];
    if (!step) return;
    event.preventDefault();
    move(position.current.x + step[0], position.current.y + step[1]);
  };

  return <div
    ref={photo}
    className="bakery-scene"
    role="img"
    aria-label="Фото бокса с круассанами и булочками. Перетащите, чтобы сдвинуть изображение; также работают клавиши со стрелками."
    tabIndex={0}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerEnd}
    onPointerCancel={onPointerEnd}
    onKeyDown={onKeyDown}
  ><img src="/images/bakery-hero-photo.png" alt="" draggable={false} /></div>;
}
