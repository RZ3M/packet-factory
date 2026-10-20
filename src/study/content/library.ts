// Real-world architectures, company architectures and engineering blogs.
// Lists and links come from the System Design Primer (CC BY 4.0); the summaries are ours.

export interface Link {
  label: string;
  url: string;
}

export interface Architecture {
  id: string;
  type: 'Data processing' | 'Data store' | 'File system' | 'Coordination';
  name: string;
  from: string;
  idea: string;
  how: string[];
  lesson: string;
  links: Link[];
}

export interface Company {
  id: string;
  name: string;
  headline: string;
  lessons: string[];
  links: Link[];
}

export interface Blog {
  name: string;
  url: string;
  known: string;
}

export const ARCHITECTURES: Architecture[] = [
  {
    id: 'mapreduce',
    type: 'Data processing',
    name: 'MapReduce',
    from: 'Google, 2004',
    idea: 'Split a huge batch job into **map** (emit key/value pairs) and **reduce** (aggregate by key) so it runs on thousands of cheap machines.',
    how: ['Input is split into chunks stored on a distributed file system', 'Mappers run next to the data and emit (key, value)', 'Shuffle groups all values by key', 'Reducers aggregate each key and write results', 'Failed tasks are simply re-run'],
    lesson: 'Move computation to the data, and make tasks deterministic so failures are cheap to retry.',
    links: [{ label: 'MapReduce paper', url: 'http://static.googleusercontent.com/media/research.google.com/zh-CN/us/archive/mapreduce-osdi04.pdf' }],
  },
  {
    id: 'spark',
    type: 'Data processing',
    name: 'Spark',
    from: 'Databricks / UC Berkeley',
    idea: 'MapReduce-style batch processing that keeps intermediate data **in memory**, making iterative jobs (ML, graph) far faster.',
    how: ['Data is modeled as immutable RDDs / DataFrames', 'Transformations build a DAG lazily', 'Lineage lets lost partitions be recomputed', 'Same engine for batch, SQL, streaming, ML'],
    lesson: 'Avoid disk round trips between stages; recompute from lineage instead of replicating everything.',
    links: [{ label: 'Spark architecture', url: 'http://www.slideshare.net/AGrishchenko/apache-spark-architecture' }],
  },
  {
    id: 'storm',
    type: 'Data processing',
    name: 'Storm',
    from: 'Twitter',
    idea: 'Real-time **stream** processing: tuples flow through a topology of spouts (sources) and bolts (processing) continuously.',
    how: ['Spouts read from queues such as Kafka', 'Bolts filter, join, count and emit', 'Acking tracks each tuple tree for at-least-once delivery', 'Used for trending topics and real-time counts'],
    lesson: 'For "what is happening right now", process events as they arrive instead of in nightly batches.',
    links: [{ label: 'Storm overview', url: 'http://www.slideshare.net/previa/storm-16094009' }],
  },
  {
    id: 'bigtable',
    type: 'Data store',
    name: 'Bigtable',
    from: 'Google, 2006',
    idea: 'A sparse, sorted, distributed map: `(row, column, timestamp) → value`. The original **wide-column** store.',
    how: ['Rows sorted by key and split into tablets', 'Writes go to a commit log + in-memory memtable', 'Memtables flush to immutable SSTables on GFS', 'Background compaction merges SSTables', 'Chubby picks the master and stores metadata'],
    lesson: 'Log-structured storage (LSM trees) turns random writes into sequential ones — huge write throughput.',
    links: [{ label: 'Bigtable paper', url: 'http://www.read.seas.harvard.edu/~kohler/class/cs239-w08/chang06bigtable.pdf' }],
  },
  {
    id: 'hbase',
    type: 'Data store',
    name: 'HBase',
    from: 'Apache',
    idea: 'Open-source Bigtable on top of HDFS, with ZooKeeper in place of Chubby.',
    how: ['Regions (like tablets) served by RegionServers', 'HDFS provides replicated storage', 'Strongly consistent single-row operations'],
    lesson: 'Layering a database on a replicated file system gives durability for free but adds latency.',
    links: [{ label: 'Intro to HBase', url: 'http://www.slideshare.net/alexbaranau/intro-to-hbase' }],
  },
  {
    id: 'cassandra',
    type: 'Data store',
    name: 'Cassandra',
    from: 'Facebook',
    idea: 'Bigtable\'s data model + Dynamo\'s **leaderless**, consistent-hashing distribution. Always writable.',
    how: ['Consistent hashing ring with virtual nodes', 'Any node coordinates a request', 'Tunable consistency: ONE, QUORUM, ALL', 'Gossip for membership, hinted handoff and read repair'],
    lesson: 'With R + W > N you get read-your-writes; lower settings trade consistency for availability (AP in CAP).',
    links: [{ label: 'Cassandra introduction', url: 'http://www.slideshare.net/planetcassandra/cassandra-introduction-features-30103666' }],
  },
  {
    id: 'dynamo',
    type: 'Data store',
    name: 'Dynamo / DynamoDB',
    from: 'Amazon, 2007',
    idea: 'A highly available key-value store for the shopping cart: never reject a write, reconcile conflicts later.',
    how: ['Consistent hashing + replication to N successors', 'Sloppy quorums and hinted handoff', 'Vector clocks detect conflicting versions', 'Merkle trees for anti-entropy repair'],
    lesson: 'Sometimes "accept the write and merge later" beats "fail the request". Pick based on the business.',
    links: [{ label: 'Dynamo paper', url: 'http://www.read.seas.harvard.edu/~kohler/class/cs239-w08/decandia07dynamo.pdf' }],
  },
  {
    id: 'mongodb',
    type: 'Data store',
    name: 'MongoDB',
    from: 'MongoDB Inc.',
    idea: 'A **document** database: JSON-like documents with rich queries and secondary indexes.',
    how: ['Replica sets with automatic primary election', 'Sharding by a shard key via mongos routers', 'Flexible schema per document'],
    lesson: 'Documents fit data that\'s read together; the shard key choice decides whether it scales.',
    links: [{ label: 'Intro to MongoDB', url: 'http://www.slideshare.net/mdirolf/introduction-to-mongodb' }],
  },
  {
    id: 'spanner',
    type: 'Data store',
    name: 'Spanner',
    from: 'Google, 2012',
    idea: 'A **globally distributed SQL** database with externally consistent transactions.',
    how: ['Data split into Paxos-replicated groups', 'TrueTime: GPS + atomic clocks bound clock uncertainty', 'Commits wait out the uncertainty for global ordering', 'Two-phase commit across groups'],
    lesson: 'With bounded clock error you can order transactions globally — paying a few ms of commit wait.',
    links: [{ label: 'Spanner paper', url: 'http://research.google.com/archive/spanner-osdi2012.pdf' }],
  },
  {
    id: 'memcached',
    type: 'Data store',
    name: 'Memcached',
    from: 'Danga / LiveJournal',
    idea: 'A dead-simple distributed **in-memory cache**: get/set/delete with LRU eviction.',
    how: ['Client hashes the key to pick a server', 'Servers don\'t talk to each other', 'Slab allocator avoids memory fragmentation', 'No persistence, no replication'],
    lesson: 'Keeping servers dumb and putting the smarts in the client makes it scale linearly.',
    links: [{ label: 'Intro to Memcached', url: 'http://www.slideshare.net/oemebamo/introduction-to-memcached' }],
  },
  {
    id: 'redis',
    type: 'Data store',
    name: 'Redis',
    from: 'Salvatore Sanfilippo',
    idea: 'An in-memory data-structure server: strings, lists, sets, sorted sets, hashes, streams — with optional persistence.',
    how: ['Single-threaded event loop, so commands are atomic', 'Persistence via RDB snapshots or append-only file', 'Replication + Sentinel for failover; Cluster for sharding', 'Sorted sets power leaderboards and rate limiters'],
    lesson: 'Rich data types let the cache do work (counters, rankings) instead of just storing blobs.',
    links: [{ label: 'Intro to Redis', url: 'http://www.slideshare.net/dvirsky/introduction-to-redis' }],
  },
  {
    id: 'gfs',
    type: 'File system',
    name: 'Google File System',
    from: 'Google, 2003',
    idea: 'A distributed file system for huge files on commodity disks, optimized for appends and streaming reads.',
    how: ['Files split into 64 MB chunks', 'Each chunk replicated 3× on chunkservers', 'A single master holds metadata only', 'Clients read data directly from chunkservers'],
    lesson: 'A single master is fine if it\'s off the data path — keep it to metadata.',
    links: [{ label: 'GFS paper', url: 'http://static.googleusercontent.com/media/research.google.com/zh-CN/us/archive/gfs-sosp2003.pdf' }],
  },
  {
    id: 'hdfs',
    type: 'File system',
    name: 'HDFS',
    from: 'Apache Hadoop',
    idea: 'Open-source GFS: NameNode (metadata) + DataNodes (blocks), the storage layer for Hadoop.',
    how: ['Large blocks (128 MB) replicated 3×', 'Rack-aware replica placement', 'Write once, read many'],
    lesson: 'Place replicas across racks so one switch failure doesn\'t lose data.',
    links: [{ label: 'HDFS design', url: 'http://hadoop.apache.org/docs/stable/hadoop-project-dist/hadoop-hdfs/HdfsDesign.html' }],
  },
  {
    id: 'chubby',
    type: 'Coordination',
    name: 'Chubby',
    from: 'Google, 2006',
    idea: 'A distributed **lock service** with a small file system, used for leader election and config.',
    how: ['Five replicas run Paxos', 'Clients hold coarse-grained locks with leases', 'Clients cache files; servers invalidate them'],
    lesson: 'Solve consensus once in a shared service instead of in every system.',
    links: [{ label: 'Chubby paper', url: 'http://static.googleusercontent.com/external_content/untrusted_dlcp/research.google.com/en/us/archive/chubby-osdi06.pdf' }],
  },
  {
    id: 'dapper',
    type: 'Coordination',
    name: 'Dapper',
    from: 'Google, 2010',
    idea: 'Distributed **tracing**: follow one request across hundreds of services.',
    how: ['Each request gets a trace id; each hop a span', 'Spans record timing and parent span', 'Sampling keeps overhead tiny', 'Inspired Zipkin, Jaeger, OpenTelemetry'],
    lesson: 'In microservices, you can\'t debug latency without tracing across services.',
    links: [{ label: 'Dapper paper', url: 'http://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36356.pdf' }],
  },
  {
    id: 'kafka',
    type: 'Coordination',
    name: 'Kafka',
    from: 'LinkedIn',
    idea: 'A distributed, partitioned, replicated **commit log** used as a pub/sub message bus.',
    how: ['Topics split into ordered partitions', 'Producers append; consumers track their own offset', 'Messages retained for days, so consumers can replay', 'Sequential disk I/O and zero-copy = huge throughput'],
    lesson: 'Treat the log as the source of truth; many consumers can read it independently.',
    links: [{ label: 'Kafka talk', url: 'http://www.slideshare.net/mumrah/kafka-talk-tri-hug' }],
  },
  {
    id: 'zookeeper',
    type: 'Coordination',
    name: 'ZooKeeper',
    from: 'Apache (Yahoo)',
    idea: 'Open-source coordination service: configuration, naming, leader election and locks.',
    how: ['Hierarchical znodes, kept in memory', 'ZAB consensus protocol across an odd-sized ensemble', 'Ephemeral nodes vanish when a client dies', 'Watches notify clients of changes'],
    lesson: 'Ephemeral nodes + watches are the building blocks for leader election and service discovery.',
    links: [{ label: 'Intro to ZooKeeper', url: 'http://www.slideshare.net/sauravhaloi/introduction-to-apache-zookeeper' }],
  },
];

const hs = (label: string, url: string): Link => ({ label, url });

export const COMPANIES: Company[] = [
  { id: 'amazon', name: 'Amazon', headline: 'Service-oriented from the start', lessons: ['Hundreds of services compose each page', 'Teams own their services end to end ("you build it, you run it")', 'Availability over consistency for the cart (Dynamo)'], links: [hs('Amazon architecture', 'http://highscalability.com/amazon-architecture')] },
  { id: 'cinchcast', name: 'Cinchcast', headline: '1,500 hours of audio a day', lessons: ['Media processing pipeline with queues and workers', 'Separate real-time and batch paths'], links: [hs('Cinchcast architecture', 'http://highscalability.com/blog/2012/7/16/cinchcast-architecture-producing-1500-hours-of-audio-every-d.html')] },
  { id: 'datasift', name: 'DataSift', headline: 'Real-time mining at 120K tweets/s', lessons: ['Stream processing over a firehose', 'Filter early to cut downstream load', 'Mix of HBase, Redis and queues'], links: [hs('DataSift architecture', 'http://highscalability.com/blog/2011/11/29/datasift-architecture-realtime-datamining-at-120000-tweets-p.html')] },
  { id: 'dropbox', name: 'Dropbox', headline: 'File sync for hundreds of millions', lessons: ['Split files into blocks and dedupe by hash', 'Metadata in sharded MySQL, blocks in object storage', 'Notification servers tell clients when to sync'], links: [hs('How we\'ve scaled Dropbox', 'https://www.youtube.com/watch?v=PE4gwstWhmc')] },
  { id: 'espn', name: 'ESPN', headline: '100,000 requests per second on game day', lessons: ['Aggressive caching at every layer', 'Plan for spiky, event-driven traffic'], links: [hs('ESPN at scale', 'http://highscalability.com/blog/2013/11/4/espns-architecture-at-scale-operating-at-100000-duh-nuh-nuhs.html')] },
  { id: 'google', name: 'Google', headline: 'Commodity hardware, software reliability', lessons: ['Assume machines fail; replicate everything', 'Build shared infrastructure: GFS, Bigtable, MapReduce, Chubby'], links: [hs('Google architecture', 'http://highscalability.com/google-architecture')] },
  { id: 'instagram', name: 'Instagram', headline: '14M users with 3 engineers', lessons: ['Keep the stack simple: Django, Postgres, Redis, Memcached', 'Shard Postgres by user with logical shards', 'IDs that embed time + shard (sortable, no coordination)'], links: [hs('14 million users, terabytes of photos', 'http://highscalability.com/blog/2011/12/6/instagram-architecture-14-million-users-terabytes-of-photos.html')] },
  { id: 'justintv', name: 'Justin.tv', headline: 'Live video broadcasting', lessons: ['Fan video out through tiers of edge servers', 'Live streaming favours UDP-like, latency-first delivery'], links: [hs('Justin.tv\'s live video architecture', 'http://highscalability.com/blog/2010/3/16/justintvs-live-video-broadcasting-architecture.html')] },
  {
    id: 'facebook',
    name: 'Facebook',
    headline: 'Memcache, TAO, Haystack, Live',
    lessons: ['Memcache in front of MySQL with lease-based invalidation to stop thundering herds', 'TAO: a graph-aware cache for objects and associations', 'Haystack: pack photos into big files to avoid per-file metadata seeks', 'Live: request coalescing at edge caches for 800K viewers'],
    links: [
      hs('Scaling memcached at Facebook', 'https://cs.uwaterloo.ca/~brecht/courses/854-Emerging-2014/readings/key-value/fb-memcached-nsdi-2013.pdf'),
      hs('TAO', 'https://cs.uwaterloo.ca/~brecht/courses/854-Emerging-2014/readings/data-store/tao-facebook-distributed-datastore-atc-2013.pdf'),
      hs('Haystack photo storage', 'https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf'),
      hs('Facebook Live', 'http://highscalability.com/blog/2016/6/27/how-facebook-live-streams-to-800000-simultaneous-viewers.html'),
    ],
  },
  { id: 'flickr', name: 'Flickr', headline: 'Federated MySQL shards', lessons: ['Shard users across MySQL pairs', 'Master-master pairs for availability', 'Offload slow work to queues'], links: [hs('Flickr architecture', 'http://highscalability.com/flickr-architecture')] },
  { id: 'mailbox', name: 'Mailbox', headline: '0 → 1M users in 6 weeks', lessons: ['Find the bottleneck before it finds you', 'Replace hot components incrementally under load'], links: [hs('Scaling Mailbox', 'http://highscalability.com/blog/2013/6/18/scaling-mailbox-from-0-to-one-million-users-in-6-weeks-and-1.html')] },
  { id: 'netflix', name: 'Netflix', headline: 'Microservices + their own CDN', lessons: ['Control plane on AWS, video from Open Connect boxes inside ISPs', 'Chaos Monkey kills instances to prove resilience', 'Circuit breakers and fallbacks between services'], links: [hs('The entire Netflix stack', 'http://highscalability.com/blog/2015/11/9/a-360-degree-view-of-the-entire-netflix-stack.html'), hs('What happens when you press play?', 'http://highscalability.com/blog/2017/12/11/netflix-what-happens-when-you-press-play.html')] },
  { id: 'pinterest', name: 'Pinterest', headline: 'Billions of page views, tiny team', lessons: ['Clustering was painful; manual MySQL sharding won', 'Pick mature, boring technology', 'IDs encode shard + type + local id'], links: [hs('0 to 10s of billions of page views', 'http://highscalability.com/blog/2013/4/15/scaling-pinterest-from-0-to-10s-of-billions-of-page-views-a.html')] },
  { id: 'playfish', name: 'Playfish', headline: 'Social games, 50M monthly users', lessons: ['Cloud elasticity for viral launches', 'Client-heavy game logic, thin servers'], links: [hs('Playfish\'s architecture', 'http://highscalability.com/blog/2010/9/21/playfishs-social-gaming-architecture-50-million-monthly-user.html')] },
  { id: 'pof', name: 'PlentyOfFish', headline: 'Huge site, one engineer', lessons: ['Scale up with big hardware before scaling out', 'Cache aggressively; keep it simple'], links: [hs('PlentyOfFish architecture', 'http://highscalability.com/plentyoffish-architecture')] },
  { id: 'salesforce', name: 'Salesforce', headline: '1.3B transactions a day, multi-tenant', lessons: ['Many customers share one schema with tenant ids', 'Metadata-driven app platform'], links: [hs('Salesforce architecture', 'http://highscalability.com/blog/2013/9/23/salesforce-architecture-how-they-handle-13-billion-transacti.html')] },
  { id: 'stackoverflow', name: 'Stack Overflow', headline: 'Famously few servers', lessons: ['Scale up: a few powerful SQL Server boxes', 'Heavy use of Redis and in-process caches', 'Measure everything before optimizing'], links: [hs('Stack Overflow architecture', 'http://highscalability.com/blog/2009/8/5/stack-overflow-architecture.html')] },
  { id: 'tripadvisor', name: 'TripAdvisor', headline: '200M dynamic page views', lessons: ['Stateless web tier + service tier', 'Memcached everywhere'], links: [hs('TripAdvisor architecture', 'http://highscalability.com/blog/2011/6/27/tripadvisor-architecture-40m-visitors-200m-dynamic-page-view.html')] },
  { id: 'tumblr', name: 'Tumblr', headline: '15B page views a month', lessons: ['Dashboard is a fan-out problem', 'Moved from a PHP monolith toward services', 'Cell architecture for the dashboard'], links: [hs('Tumblr architecture', 'http://highscalability.com/blog/2012/2/13/tumblr-architecture-15-billion-page-views-a-month-and-harder.html')] },
  {
    id: 'twitter',
    name: 'Twitter',
    headline: 'Fan-out on write, timelines in Redis',
    lessons: ['Pre-compute home timelines in Redis on every tweet', 'Celebrities are fanned out on read instead', 'Snowflake: time-ordered unique IDs without coordination', 'Moved from a Rails monolith to JVM services'],
    links: [hs('Timelines at scale', 'https://www.infoq.com/presentations/Twitter-Timeline-Scalability'), hs('150M active users, 300K QPS', 'http://highscalability.com/blog/2013/7/8/the-architecture-twitter-uses-to-deal-with-150m-active-users.html'), hs('Storing 250M tweets a day in MySQL', 'http://highscalability.com/blog/2011/12/19/how-twitter-stores-250-million-tweets-a-day-using-mysql.html')],
  },
  { id: 'uber', name: 'Uber', headline: 'Real-time marketplace', lessons: ['Geospatial indexing (S2 cells) to match riders and drivers', 'Ringpop: consistent hashing + gossip for sharding state', 'Thousands of microservices bring their own problems'], links: [hs('Uber\'s real-time market platform', 'http://highscalability.com/blog/2015/9/14/how-uber-scales-their-real-time-market-platform.html'), hs('Lessons from 1000 services', 'http://highscalability.com/blog/2016/10/12/lessons-learned-from-scaling-uber-to-2000-engineers-1000-ser.html')] },
  { id: 'whatsapp', name: 'WhatsApp', headline: '450M users, ~32 engineers', lessons: ['Erlang/FreeBSD: millions of connections per server', 'Store-and-forward: messages are deleted once delivered', 'Ruthless focus on a small feature set'], links: [hs('The WhatsApp architecture', 'http://highscalability.com/blog/2014/2/26/the-whatsapp-architecture-facebook-bought-for-19-billion.html')] },
  { id: 'youtube', name: 'YouTube', headline: 'Video at planet scale', lessons: ['Serve popular videos from a CDN, the long tail from colo', 'Vitess: sharding middleware for MySQL', 'Thumbnails are a small-file problem (Bigtable)'], links: [hs('YouTube architecture', 'http://highscalability.com/youtube-architecture'), hs('YouTube scalability talk', 'https://www.youtube.com/watch?v=w5WVu624fY8')] },
];

export const BLOGS: Blog[] = [
  { name: 'Airbnb Engineering', url: 'http://nerds.airbnb.com/', known: 'Search ranking, payments, service migration' },
  { name: 'Atlassian Developers', url: 'https://developer.atlassian.com/blog/', known: 'Collaborative tools, multi-tenant SaaS' },
  { name: 'AWS Blog', url: 'https://aws.amazon.com/blogs/aws/', known: 'Cloud building blocks as they launch' },
  { name: 'Bitly Engineering', url: 'http://word.bitly.com/', known: 'URL shortening at scale' },
  { name: 'Box Blogs', url: 'https://blog.box.com/blog/category/engineering', known: 'Enterprise file storage' },
  { name: 'Cloudera Developer Blog', url: 'http://blog.cloudera.com/', known: 'Hadoop ecosystem, big data' },
  { name: 'Dropbox Tech Blog', url: 'https://tech.dropbox.com/', known: 'Storage infra (Magic Pocket), sync' },
  { name: 'Engineering at Quora', url: 'https://www.quora.com/q/quoraengineering', known: 'Feed ranking, ML infra' },
  { name: 'eBay Tech Blog', url: 'http://www.ebaytechblog.com/', known: 'Marketplace search, payments' },
  { name: 'Evernote Tech Blog', url: 'https://blog.evernote.com/tech/', known: 'Sync and storage' },
  { name: 'Etsy Code as Craft', url: 'http://codeascraft.com/', known: 'Continuous deployment, activity feeds' },
  { name: 'Facebook Engineering', url: 'https://www.facebook.com/Engineering', known: 'Memcache, TAO, social graph' },
  { name: 'Flickr Code', url: 'http://code.flickr.net/', known: 'Photo storage, sharded MySQL' },
  { name: 'Foursquare Engineering', url: 'http://engineering.foursquare.com/', known: 'Location data, geo search' },
  { name: 'GitHub Engineering', url: 'https://github.blog/category/engineering', known: 'Git at scale, MySQL operations' },
  { name: 'Google Research Blog', url: 'http://googleresearch.blogspot.com/', known: 'Distributed systems research, ML' },
  { name: 'Groupon Engineering', url: 'https://engineering.groupon.com/', known: 'Commerce platform' },
  { name: 'Heroku Engineering', url: 'https://engineering.heroku.com/', known: 'Platform-as-a-service, Postgres' },
  { name: 'HubSpot Engineering', url: 'http://product.hubspot.com/blog/topic/engineering', known: 'SaaS infra, HBase' },
  { name: 'High Scalability', url: 'http://highscalability.com/', known: 'Architecture write-ups of many companies' },
  { name: 'Instagram Engineering', url: 'http://instagram-engineering.tumblr.com/', known: 'Sharded Postgres, Django at scale' },
  { name: 'Intel Software Blog', url: 'https://software.intel.com/en-us/blogs/', known: 'Performance, hardware' },
  { name: 'Jane Street Tech Blog', url: 'https://blogs.janestreet.com/category/ocaml/', known: 'Trading systems, OCaml' },
  { name: 'LinkedIn Engineering', url: 'http://engineering.linkedin.com/blog', known: 'Kafka, data infra, social graph' },
  { name: 'Microsoft Engineering', url: 'https://engineering.microsoft.com/', known: 'Cloud, large-scale services' },
  { name: 'Microsoft Python Engineering', url: 'https://blogs.msdn.microsoft.com/pythonengineering/', known: 'Python tooling' },
  { name: 'Netflix Tech Blog', url: 'http://techblog.netflix.com/', known: 'Chaos engineering, microservices, CDN' },
  { name: 'PayPal Developer Blog', url: 'https://developer.paypal.com/community/blog/', known: 'Payments, consistency' },
  { name: 'Pinterest Engineering', url: 'https://medium.com/@Pinterest_Engineering', known: 'Sharding, recommendation' },
  { name: 'Reddit Blog', url: 'http://www.redditblog.com/', known: 'Voting, caching, comment trees' },
  { name: 'Salesforce Engineering', url: 'https://developer.salesforce.com/blogs/engineering/', known: 'Multi-tenancy' },
  { name: 'Slack Engineering', url: 'https://slack.engineering/', known: 'Real-time messaging, Vitess' },
  { name: 'Spotify Labs', url: 'https://labs.spotify.com/', known: 'Squads, event delivery, recommendations' },
  { name: 'Stripe Engineering', url: 'https://stripe.com/blog/engineering', known: 'Rate limiters, idempotency, APIs' },
  { name: 'Twilio Engineering', url: 'http://www.twilio.com/engineering', known: 'Communications APIs' },
  { name: 'Twitter Engineering', url: 'https://blog.twitter.com/engineering/', known: 'Timelines, Snowflake, Manhattan' },
  { name: 'Uber Engineering', url: 'http://eng.uber.com/', known: 'Geo, microservices, Schemaless' },
  { name: 'Yahoo Engineering', url: 'http://yahooeng.tumblr.com/', known: 'Hadoop, ZooKeeper origins' },
  { name: 'Yelp Engineering', url: 'http://engineeringblog.yelp.com/', known: 'Search, data pipeline' },
  { name: 'Zynga Engineering', url: 'https://www.zynga.com/blogs/engineering', known: 'Social gaming at scale' },
];

/** How to get value out of architecture write-ups and engineering blogs. */
export const READING_TIPS: { title: string; text: string }[] = [
  { title: 'Read for patterns, not trivia', text: "Don't memorize version numbers. Look for the shared moves: cache, shard, queue, replicate, denormalize." },
  { title: 'Ask "what broke?"', text: 'Most posts are about one bottleneck. Name it, then name the fix and what it cost.' },
  { title: 'Study your target company', text: 'Interview questions often come from the company\'s own domain. Read 3–5 of their recent posts.' },
  { title: 'Steal the vocabulary', text: '"We fanned out on write, except for celebrities" sounds senior because it shows trade-offs.' },
];
