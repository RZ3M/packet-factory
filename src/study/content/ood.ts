// Object-oriented design questions from the primer, with worked solutions.
// Class layouts follow the primer's solutions (CC BY 4.0, Donne Martin);
// the method bodies are filled in here so each answer is runnable.

export interface OodQuestion {
  id: string;
  title: string;
  icon: string;
  prompt: string;
  clarify: string[];
  classes: { name: string; role: string }[];
  code: string;
  why: { title: string; text: string }[];
  followups: string[];
}

export const OOD: OodQuestion[] = [
  {
    id: 'hash-map',
    title: 'Hash map',
    icon: 'Hash',
    prompt: 'Design a hash map that supports `set`, `get` and `remove`.',
    clarify: ['Keys are integers (so a simple modulo hash works)', 'Collisions must be handled', 'No need to resize — but mention it', 'Fits in memory'],
    classes: [
      { name: 'Item', role: 'A key/value pair stored in a bucket.' },
      { name: 'HashTable', role: 'Fixed array of buckets; each bucket is a list (chaining).' },
    ],
    code: `class Item:
    def __init__(self, key, value):
        self.key, self.value = key, value


class HashTable:
    def __init__(self, size):
        self.size = size
        self.table = [[] for _ in range(size)]

    def _hash(self, key):
        return key % self.size

    def set(self, key, value):
        bucket = self.table[self._hash(key)]
        for item in bucket:
            if item.key == key:
                item.value = value      # update in place
                return
        bucket.append(Item(key, value))

    def get(self, key):
        for item in self.table[self._hash(key)]:
            if item.key == key:
                return item.value
        raise KeyError(key)

    def remove(self, key):
        bucket = self.table[self._hash(key)]
        for i, item in enumerate(bucket):
            if item.key == key:
                del bucket[i]
                return
        raise KeyError(key)`,
    why: [
      { title: 'Chaining for collisions', text: 'Two keys can hash to the same bucket. A list per bucket keeps both; lookups scan only that short list.' },
      { title: 'O(1) average, O(n) worst', text: 'With a good hash and low load factor, buckets stay tiny. If every key collides you get one long list.' },
      { title: 'Resize on load factor', text: 'Real maps double the table when `count / size > 0.75` and rehash every item, keeping buckets short.' },
    ],
    followups: ['How would you support string keys?', 'Open addressing vs chaining?', 'How do you make it thread-safe?'],
  },
  {
    id: 'lru-cache',
    title: 'LRU cache',
    icon: 'Zap',
    prompt: 'Design a least-recently-used cache for web search query results.',
    clarify: ['Inputs are queries, values are results', 'Fixed maximum number of entries', 'Evict the least recently used entry when full', '`get` and `set` must be O(1)'],
    classes: [
      { name: 'Node', role: 'Doubly linked list node holding a query and its results.' },
      { name: 'LinkedList', role: 'Recency order: head = most recent, tail = next to evict.' },
      { name: 'Cache', role: 'Dict for O(1) lookup + list for O(1) reordering.' },
    ],
    code: `class Node:
    def __init__(self, query, results):
        self.query, self.results = query, results
        self.prev = self.next = None


class LinkedList:
    def __init__(self):
        self.head = self.tail = None

    def append_to_front(self, node):
        node.prev, node.next = None, self.head
        if self.head:
            self.head.prev = node
        self.head = node
        if self.tail is None:
            self.tail = node

    def unlink(self, node):
        if node.prev: node.prev.next = node.next
        else:         self.head = node.next
        if node.next: node.next.prev = node.prev
        else:         self.tail = node.prev

    def move_to_front(self, node):
        self.unlink(node)
        self.append_to_front(node)

    def remove_from_tail(self):
        node = self.tail
        self.unlink(node)
        return node


class Cache:
    def __init__(self, max_size):
        self.max_size = max_size
        self.lookup = {}             # query -> Node
        self.order = LinkedList()

    def get(self, query):
        node = self.lookup.get(query)
        if node is None:
            return None
        self.order.move_to_front(node)
        return node.results

    def set(self, query, results):
        node = self.lookup.get(query)
        if node:
            node.results = results
            self.order.move_to_front(node)
            return
        if len(self.lookup) == self.max_size:
            old = self.order.remove_from_tail()
            del self.lookup[old.query]
        node = Node(query, results)
        self.order.append_to_front(node)
        self.lookup[query] = node`,
    why: [
      { title: 'Two structures, one job each', text: 'The dict finds a node in O(1). The doubly linked list moves or evicts a node in O(1). Neither can do both alone.' },
      { title: 'Doubly linked', text: 'Unlinking a node from the middle needs its `prev` pointer — a singly linked list would need an O(n) walk.' },
      { title: 'Node stores its key', text: 'When evicting the tail we must also delete it from the dict, so each node remembers its own query.' },
    ],
    followups: ['How do you add TTL expiry?', 'How would you shard it across machines? (consistent hashing)', 'LRU vs LFU for search traffic?'],
  },
  {
    id: 'call-center',
    title: 'Call center',
    icon: 'Headphones',
    prompt: 'Design a call center with operators, supervisors and directors. Calls go to a free operator first and escalate upward.',
    clarify: ['Three ranks: operator → supervisor → director', 'An employee who can\'t handle a call escalates it', 'If nobody at the right rank is free, the call waits in a queue', 'Directors can handle every call'],
    classes: [
      { name: 'Rank (Enum)', role: 'OPERATOR, SUPERVISOR, DIRECTOR.' },
      { name: 'Employee (abstract)', role: 'Takes, completes and escalates calls.' },
      { name: 'Operator / Supervisor / Director', role: 'Concrete ranks; each knows where to escalate.' },
      { name: 'Call', role: 'Required rank, state and assigned employee.' },
      { name: 'CallCenter', role: 'Dispatcher: finds a free employee or queues the call.' },
    ],
    code: `from abc import ABC, abstractmethod
from collections import deque
from enum import IntEnum


class Rank(IntEnum):
    OPERATOR = 0
    SUPERVISOR = 1
    DIRECTOR = 2


class Call:
    def __init__(self, rank=Rank.OPERATOR):
        self.rank = rank
        self.employee = None


class Employee(ABC):
    def __init__(self, name, rank, center):
        self.name, self.rank, self.center = name, rank, center
        self.call = None

    def take_call(self, call):
        self.call, call.employee = call, self

    def complete_call(self):
        self.call = None
        self.center.employee_freed(self)

    @abstractmethod
    def escalate_call(self): ...

    def _escalate(self, to_rank):
        call, self.call = self.call, None
        call.rank = to_rank
        self.center.dispatch(call)
        self.center.employee_freed(self)


class Operator(Employee):
    def escalate_call(self):
        self._escalate(Rank.SUPERVISOR)


class Supervisor(Employee):
    def escalate_call(self):
        self._escalate(Rank.DIRECTOR)


class Director(Employee):
    def escalate_call(self):
        raise NotImplementedError('Directors must handle every call')


class CallCenter:
    def __init__(self):
        self.staff = {r: [] for r in Rank}
        self.queues = {r: deque() for r in Rank}

    def hire(self, employee):
        self.staff[employee.rank].append(employee)

    def dispatch(self, call):
        # try the required rank first, then anyone more senior
        for rank in Rank:
            if rank < call.rank:
                continue
            for e in self.staff[rank]:
                if e.call is None:
                    e.take_call(call)
                    return e
        self.queues[call.rank].append(call)
        return None

    def employee_freed(self, employee):
        for rank in sorted(Rank, reverse=True):
            if rank <= employee.rank and self.queues[rank]:
                employee.take_call(self.queues[rank].popleft())
                return`,
    why: [
      { title: 'Polymorphic escalation', text: 'Each subclass decides where its calls go. Adding a new rank means a new subclass, not another `if` in the dispatcher (open/closed principle).' },
      { title: 'Dispatcher owns the queue', text: 'Employees don\'t search for each other. `CallCenter` is the single place that knows who is free — easy to swap in smarter routing.' },
      { title: 'Freed employees pull work', text: 'When someone hangs up, they take the most senior waiting call they are allowed to handle, so queued calls never starve.' },
    ],
    followups: ['How would you route by skill or language?', 'Add priorities (VIP callers)?', 'How would this scale to many call centers? (a message queue per rank)'],
  },
  {
    id: 'deck-of-cards',
    title: 'Deck of cards',
    icon: 'Spade',
    prompt: 'Design a generic deck of cards, then use it to implement blackjack.',
    clarify: ['Standard 52-card deck, four suits', 'Generic enough for other games', 'Blackjack: aces count 1 or 11, face cards count 10', 'Best score is the highest ≤ 21'],
    classes: [
      { name: 'Suit (Enum)', role: 'HEART, DIAMOND, CLUBS, SPADE.' },
      { name: 'Card', role: 'Value + suit; base class for game-specific cards.' },
      { name: 'BlackJackCard', role: 'Overrides how a card is scored.' },
      { name: 'Hand / BlackJackHand', role: 'Cards held by a player; blackjack picks the best score.' },
      { name: 'Deck', role: 'Shuffles and deals cards.' },
    ],
    code: `import random
from enum import Enum


class Suit(Enum):
    HEART, DIAMOND, CLUBS, SPADE = range(4)


class Card:
    def __init__(self, value, suit):
        self.value, self.suit = value, suit   # value 1..13


class BlackJackCard(Card):
    def is_ace(self):
        return self.value == 1

    def points(self):
        return 10 if self.value >= 11 else self.value


class Hand:
    def __init__(self, cards=None):
        self.cards = list(cards or [])

    def add_card(self, card):
        self.cards.append(card)

    def score(self):
        return sum(c.value for c in self.cards)


class BlackJackHand(Hand):
    BLACKJACK = 21

    def possible_scores(self):
        base = sum(c.points() for c in self.cards)
        aces = sum(c.is_ace() for c in self.cards)
        # each ace can add 10 more (counting as 11 instead of 1)
        return [base + 10 * k for k in range(aces + 1)]

    def score(self):
        ok = [s for s in self.possible_scores() if s <= self.BLACKJACK]
        return max(ok) if ok else min(self.possible_scores())


class Deck:
    def __init__(self, cards):
        self.cards = cards
        self.next = 0

    def remaining(self):
        return len(self.cards) - self.next

    def deal(self):
        if self.remaining() == 0:
            return None
        card = self.cards[self.next]
        self.next += 1
        return card

    def shuffle(self):
        random.shuffle(self.cards)
        self.next = 0


deck = Deck([BlackJackCard(v, s) for s in Suit for v in range(1, 14)])`,
    why: [
      { title: 'Generic base, game-specific subclass', text: '`Card` and `Hand` know nothing about blackjack. Poker would add `PokerHand` without touching the deck.' },
      { title: 'Aces as a list of scores', text: 'Instead of special-casing, compute every possible total and pick the best one that doesn\'t bust.' },
      { title: 'Deal by index', text: 'Dealing moves a pointer instead of removing from the list — O(1) and the deck can be reshuffled and reused.' },
    ],
    followups: ['How would you support multiple decks (a shoe)?', 'Where does the dealer\'s logic live?', 'How would you test shuffling fairly?'],
  },
  {
    id: 'parking-lot',
    title: 'Parking lot',
    icon: 'CircleParking',
    prompt: 'Design a multi-level parking lot for motorcycles, cars and buses.',
    clarify: ['Spots come in motorcycle, compact and large sizes', 'Motorcycle: any spot · Car: compact or large · Bus: 5 consecutive large spots in one row', 'Multiple levels', 'No payments in scope'],
    classes: [
      { name: 'VehicleSize (Enum)', role: 'MOTORCYCLE, COMPACT, LARGE.' },
      { name: 'Vehicle (abstract)', role: 'Plate, size, spots needed; decides which spots fit it.' },
      { name: 'Motorcycle / Car / Bus', role: 'Concrete vehicles with their own fit rules.' },
      { name: 'ParkingLot', role: 'Tries each level in turn.' },
      { name: 'Level', role: 'Rows of spots; finds a run of free spots.' },
      { name: 'ParkingSpot', role: 'Size, location and the vehicle in it.' },
    ],
    code: `from abc import ABC, abstractmethod
from enum import IntEnum


class VehicleSize(IntEnum):
    MOTORCYCLE = 0
    COMPACT = 1
    LARGE = 2


class Vehicle(ABC):
    spots_needed = 1

    def __init__(self, plate):
        self.plate = plate
        self.spots = []

    @abstractmethod
    def can_fit_in(self, spot): ...


class Motorcycle(Vehicle):
    def can_fit_in(self, spot):
        return True


class Car(Vehicle):
    def can_fit_in(self, spot):
        return spot.size >= VehicleSize.COMPACT


class Bus(Vehicle):
    spots_needed = 5

    def can_fit_in(self, spot):
        return spot.size == VehicleSize.LARGE


class ParkingSpot:
    def __init__(self, row, number, size):
        self.row, self.number, self.size = row, number, size
        self.vehicle = None

    def is_free(self):
        return self.vehicle is None


class Level:
    def __init__(self, floor, spots):
        self.floor, self.spots = floor, spots
        self.free = len(spots)

    def park(self, vehicle):
        start = self._find_run(vehicle)
        if start is None:
            return False
        for spot in self.spots[start:start + vehicle.spots_needed]:
            spot.vehicle = vehicle
            vehicle.spots.append(spot)
        self.free -= vehicle.spots_needed
        return True

    def _find_run(self, vehicle):
        run, start = 0, 0
        for i, spot in enumerate(self.spots):
            same_row = run and spot.row == self.spots[i - 1].row
            if spot.is_free() and vehicle.can_fit_in(spot):
                if not same_row:
                    run, start = 0, i
                run += 1
                if run == vehicle.spots_needed:
                    return start
            else:
                run = 0
        return None

    def leave(self, vehicle):
        for spot in vehicle.spots:
            spot.vehicle = None
        self.free += len(vehicle.spots)
        vehicle.spots = []


class ParkingLot:
    def __init__(self, levels):
        self.levels = levels

    def park(self, vehicle):
        return any(level.park(vehicle) for level in self.levels)`,
    why: [
      { title: 'Vehicles own their fit rules', text: '`can_fit_in` lives on each vehicle type, so adding a truck is a new subclass — the level\'s search loop doesn\'t change.' },
      { title: 'Consecutive-spot search', text: 'A bus needs 5 adjacent large spots in the same row; the level scans for a run, resetting at row boundaries and taken spots.' },
      { title: 'Free counters', text: 'Each level keeps a count of free spots so the lot can show "Level 3: 42 free" without scanning.' },
    ],
    followups: ['How do you add tickets and payment?', 'How would you find the nearest free spot fast? (per-size free lists)', 'Handle many entrances concurrently?'],
  },
  {
    id: 'chat-server',
    title: 'Chat server',
    icon: 'MessagesSquare',
    prompt: 'Design the classes for a chat server: users, friend requests, private chats and group chats.',
    clarify: ['Users add friends via requests (approve / reject)', 'Private 1:1 chats and group chats', 'Messages have text and a timestamp', 'Focus on the object model; scaling is a follow-up'],
    classes: [
      { name: 'UserService', role: 'Registry of users; routes friend requests.' },
      { name: 'User', role: 'Friends, chats, and pending requests.' },
      { name: 'Chat (abstract)', role: 'An id, members and a message list.' },
      { name: 'PrivateChat / GroupChat', role: 'Two fixed members vs add/remove members.' },
      { name: 'Message', role: 'Id, sender, text, timestamp.' },
      { name: 'AddRequest + RequestStatus', role: 'A friend request and its state.' },
    ],
    code: `import itertools
import time
from enum import Enum

_ids = itertools.count(1)


class RequestStatus(Enum):
    UNREAD, READ, ACCEPTED, REJECTED = range(4)


class AddRequest:
    def __init__(self, from_id, to_id):
        self.from_id, self.to_id = from_id, to_id
        self.status = RequestStatus.UNREAD
        self.timestamp = time.time()


class Message:
    def __init__(self, sender_id, text):
        self.id = next(_ids)
        self.sender_id, self.text = sender_id, text
        self.timestamp = time.time()


class Chat:
    def __init__(self, users):
        self.id = next(_ids)
        self.users = list(users)
        self.messages = []

    def post(self, sender, text):
        if sender not in self.users:
            raise PermissionError('not a member')
        self.messages.append(Message(sender.id, text))


class PrivateChat(Chat):
    def __init__(self, a, b):
        super().__init__([a, b])


class GroupChat(Chat):
    def add_user(self, user):
        self.users.append(user)

    def remove_user(self, user):
        self.users.remove(user)


class User:
    def __init__(self, user_id, name):
        self.id, self.name = user_id, name
        self.friends = {}            # id -> User
        self.private_chats = {}      # friend id -> PrivateChat
        self.requests = {}           # from id -> AddRequest

    def message_user(self, friend_id, text):
        chat = self.private_chats.get(friend_id)
        if chat is None:
            friend = self.friends[friend_id]
            chat = PrivateChat(self, friend)
            self.private_chats[friend_id] = chat
            friend.private_chats[self.id] = chat
        chat.post(self, text)


class UserService:
    def __init__(self):
        self.users = {}

    def add_user(self, user_id, name):
        self.users[user_id] = User(user_id, name)

    def send_request(self, from_id, to_id):
        self.users[to_id].requests[from_id] = AddRequest(from_id, to_id)

    def approve(self, from_id, to_id):
        req = self.users[to_id].requests.pop(from_id)
        req.status = RequestStatus.ACCEPTED
        a, b = self.users[from_id], self.users[to_id]
        a.friends[b.id], b.friends[a.id] = b, a

    def reject(self, from_id, to_id):
        self.users[to_id].requests.pop(from_id).status = RequestStatus.REJECTED`,
    why: [
      { title: 'A service owns relationships', text: 'Friendship changes two users at once. Doing it in `UserService` keeps both sides consistent instead of trusting each `User` to update the other.' },
      { title: 'Chat hierarchy', text: 'Private and group chats share messages and membership checks; only membership rules differ, so they subclass a common `Chat`.' },
      { title: 'Shared chat object', text: 'Both users point to the same `PrivateChat`, so a message is stored once and seen by both.' },
    ],
    followups: ['How do you deliver messages to online users in real time? (WebSockets + presence service)', 'Where do messages live at scale? (wide-column store keyed by chat id + time)', 'How do you handle offline users? (queue + push notifications)'],
  },
];
