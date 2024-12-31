+++
date = '2024-12-31T12:04:21+08:00'
draft = false
title = 'Rust Book Ch16 Concurrency'
tag = ["Rust"]
+++

# thread
Rust中默认提供的是1:1的线程模型（1个语言线程等于1个系统线程），也有其它crate实现了非1:1模型
```rust
use std::thread;
use std::time::Duration;

fn main() {
    thread::spawn(|| {
        for i in 1..10 {
            println!("hi number {i} from the spawned thread!");
            thread::sleep(Duration::from_millis(1));
        }
    });

    for i in 1..5 {
        println!("hi number {i} from the main thread!");
        thread::sleep(Duration::from_millis(1));
    }
}

// -- console --
/*
hi number 1 from the main thread!
hi number 1 from the spawned thread!
hi number 2 from the main thread!
hi number 2 from the spawned thread!
hi number 3 from the main thread!
hi number 3 from the spawned thread!
hi number 4 from the main thread!
hi number 4 from the spawned thread!
hi number 5 from the spawned thread!
*/
```
在main()结束时，所有衍生线程都会被关闭，无论是否执行完
`thread:sleep()`用于在让线程内睡眠一段时间，并不保证线程会发生切换
## move
之前在[[ch13 closures, iterator#ownership]]讨论过当闭包涉及外部变量时，默认会按照最低要求进行捕获，但是当涉及并发时，会有一些问题
```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(|| {
        println!("Here's a vector: {v:?}");
    });

    handle.join().unwrap();
}
```
在这个程序中，传入spawn线程的闭包需要捕获v，因此最小的要求是对v进行借用，但是对于spawn线程来说，Rust并不知道spawn线程需要运行多久，因此spawn线程中的对v的引用有可能invalid，例如在这个例子中
```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(|| {
        println!("Here's a vector: {v:?}");
    });

    drop(v); // oh no!

    handle.join().unwrap();
}
```
虽然也无法被编译，但是可以说明v是有可能invalid的
通过使用`move`，可以解决这个问题，但是对于第二个例子，在其中加上`move`也无法编译，因为Rust会认为v将所有权转移给闭包之后，main thread中之后不能再使用v了（违背所有权规则）
## ch16-01 quizz
### q1
```rust
use std::thread; 
fn main() {     
	let mut n = 1;     
	let t = thread::spawn(move || {         
		n = n + 1;         
		thread::spawn(move || { 
			n = n + 1;         
		})     
	});     
	n = n + 1;     
	t.join().unwrap().join().unwrap();     
	println!("{n}"); 
}
```
在这个例子中，程序将会成功编译，相比上面的例子区别是虽然使用了`move`，但是这里的对象是`i32`，因此会进行copy，所以在创建线程后仍然可以使用n，输出将是`2`
### q2
```rust
use std::thread;

fn test(v:& str) {
    let handle = thread::spawn(move || {
        println!("Here's a vector: {v:?}");
    });
    handle.join().unwrap();
}
fn main() {
    let v = "abc";

    test(v);
    
}
```
在这个例子中将会编译错误`borrowed data escapes outside of function`，具体是因为test()中传入是一个&str，闭包中使用了该引用，根据[[ch13 closures, iterator#Captured lifetime]]中提到的，当闭包捕获引用时，需要确保闭包的生命周期短于该引用的生命周期；而在本例子中，使用闭包来创建新线程，此时编译器并不知道线程何时会被执行，因此会有一个保守的限制是被捕获的引用的生命周期是`'static`，而这里并没有提供该限制
> ==（但是这里有一个问题是，不是已经在test()最后使用了`join()`来限制线程执行时间了吗（可能是编译器限制））==

因此，如果修改为
```rust
use std::thread;

fn test(v:&'static str) {
    let handle = thread::spawn(move || {
        println!("Here's a vector: {v:?}");
    });
    handle.join().unwrap();
}
fn main() {
    let v = "abc";

    test(v);
    
}
```
则程序成功执行
另外，可以对比的是
```rust
// use std::thread;

fn test(v: &str) {
    let a = move || {
        println!("Here's a vector: {v:?}");
    };
    a();
}
fn main() {
    let v = "abc";

    test(v);
    
}
```
去掉了线程创建，此时闭包可以确定是在test()函数中使用，因此不需要额外限制
# message
Rust中提供了channel来支持IPC
channel的一端关闭则channel关闭

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let val = String::from("hi");
        tx.send(val).unwrap();
    });
	let received = rx.recv().unwrap(); 
	println!("Got: {received}");
}
```
这里的mpsc表示multiple producer single consumer
`send()`将会返回`Result<T, E>`，例如当rx已经被删除没有接收方可以接收数据，将会返回一个`Err`
rx的`rev()`方法将会阻塞当前进程等待数据被发送到channel中，如果接收到数据则返回，如果tx被关闭还没有接收到数据将返回`Err`
rx的`try_recv（）`以不阻塞的方式接收数据，立刻返回`Result<T, E>`
```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let vals = vec![
            String::from("hi"),
            String::from("from"),
            String::from("the"),
            String::from("thread"),
        ];

        for val in vals {
            tx.send(val).unwrap();
            thread::sleep(Duration::from_secs(1));
        }
    });

    for received in rx {
        println!("Got: {received}");
    }
}
```
如果有多个消息需要接收的话，可以将rx作为迭代器
多个producer:
```rust
    // --snip--

    let (tx, rx) = mpsc::channel();

    let tx1 = tx.clone();
    thread::spawn(move || {
        let vals = vec![
            String::from("hi"),
            String::from("from"),
            String::from("the"),
            String::from("thread"),
        ];

        for val in vals {
            tx1.send(val).unwrap();
            thread::sleep(Duration::from_secs(1));
        }
    });

    thread::spawn(move || {
        let vals = vec![
            String::from("more"),
            String::from("messages"),
            String::from("for"),
            String::from("you"),
        ];

        for val in vals {
            tx.send(val).unwrap();
            thread::sleep(Duration::from_secs(1));
        }
    });

    for received in rx {
        println!("Got: {received}");
    }

    // --snip--

```
## ch16-02 quizz
```rust
use std::{sync::mpsc, thread}; 
fn main() {     
	let (tx, rx) = mpsc::channel();     
	thread::spawn(move || {         
		let s = String::from("Hello world");         
		tx.send(s.clone()).unwrap(); 
		tx.send(s.len()).unwrap();     
	});     
	let s = rx.recv().unwrap();     
	let n = rx.recv().unwrap();     
	println!("{s} {n}"); 
}
```
这个程序将会编译错误，因为`send()`不支持发送多种类型
>  可以通过`Enum`或者==Any trait==来实现多类型
# Shared-State Concurrency
基于message(channel)的并行更接近于single-ownership，一旦我们发送了某一个值之后就无法再使用它了，但是Shared memory concurrency更接近于multiple ownership，允许在同一时刻多个线程读取同一个内存
在这里，互斥锁被作为shared memory concurrency的一种常见方式，Rust的类型系统和所有权系统可以帮助我们更加正确对互斥锁进行管理
## mutex
```rust
use std::sync::Mutex;

fn main() {
    let m = Mutex::new(5);

    {
        let mut num = m.lock().unwrap();
        *num = 6;
    }

    println!("m = {m:?}");
}
```
`lock()`会尝试获取锁并阻塞当前线程，返回`LockResult<MutexGuard<'_, T>>`
如果持有锁的线程panic，则另一个线程中的`lock()`将fail
当正常申请到锁之后，将返回一个&mut，指向互斥锁中保存的数据
> 类型系统将确保在直接使用互斥锁中的数据前申请锁，因为m的类型是`Mutex<i32>`，无法直接当成`i32`使用，因此必须先调用`lock()`获得锁

`MutexGuard`是一个智能指针，实现了`Drop`和`Deref`，因此num可以进行解引用，并且在inner scope结束的时候，该指针会自动释放也即释放锁

## multiple threads
如果尝试在多线程下使用互斥锁：
```rust
use std::rc::Rc;
use std::sync::Mutex;
use std::thread;

fn main() {
    let counter = Rc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Rc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();

            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Result: {}", *counter.lock().unwrap());
}
```
因为需要在多个线程中使用`send()`，所以使用了`Rc<T>`来允许多个所有者
这个程序将会报错
> the trait `Send` is not implemented for `Rc<Mutex<i32>>`

`Send`trait是为类型提供线程安全的方式之一，`Rc<T>`并不是线程安全的，因为其内部操作引用计数时并没有使用任何同步原语来确保更新是原子的
`Arc<T>`是线程安全的`Rc<T>`，具有相同的api
>使用线程安全的版本会引入一定的性能开销

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();

            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Result: {}", *counter.lock().unwrap());
}
```
类似于使用`RefCell<T>`包裹`Rc<T>`，`Muxtex<T>`也提供了内部可变性（counter是不可变量，但是可以得到内部数据的可变引用），将`Muxtex<T>`包裹`Arc<T>`

除了`Muxtex<T>`，标准库中有其他的更简单的类型，用来为原始类型提供线程安全
类似于`RefCell<T>`中的循环引用，使用`Muxtex<T>`的话有逻辑错误的可能：死锁

## ch16-03 quizz
```rust
use std::{sync::Arc, thread}; 
	fn main() {     
		let s = String::from("Hello world");     
		let a = Arc::new(&s);     
		let a2 = Arc::clone(&a);     
		let t = thread::spawn(move || a2.len());     
		let len = t.join().unwrap();     
		println!("{} {}", a, len); 
}
```
这个程序将无法编译，当`Arc<T>`中的包括的是引用（非智能指针），因为有可能在线程执行前该引用就失效，因此编译器保守的不允许这种行为

# Extensible Concurrency
前面讨论的这些特性都属于Rust标准库所提供的，Rust语言本身提供的特性相对较少，其中有[[ch16 Concurrency#marker trait|marker trait]]: `Sync`, `Send
## Send
实现了`Send`的类型表示其所有权可以在线程间转移
大部分Rust（原始）类型都实现了`Send`，其中例如`Rc<T>`，==raw指针==是例外
一个类型如果完全由`Send`类型组成，那么它也将是自动标记为`Send`，例如：
```rust
struct Point {
    x: i32, // `i32` is `Send`
    y: i32, // `i32` is `Send`
}
// Since all fields (x and y) are `Send`, `Point` is automatically `Send`.
```
## Sync
实现了`Sync`的类型表示在多线程中对其进行引用是安全的，更接近于线程安全的概念（一块内存在多线程中访问是安全的）
如果一个类型T实现了`Sync`，意味着在多线程中`&T`是允许（安全）的，也即`&T`满足`Send`，因为可以在
原始类型都是`Sync`的
一个类型如果完全由`Sync`类型组成，那么它也将是自动标记为`Sync`
- `Rc<T>`既不是`Sync`也不是`Send`
- `RefCell<T>`, `Cell<T>`是`Send`，但不是`Sync`，其内部使用的runtime borrow check非线程安全
- `Mutex<T>`是`RefCell<T>`的线程安全替代，是`Send`也是`Sync`
- `MutexGuard<'a, T>`(`Mutex::lock()`的返回值)是`Sync`但不是`Send`

手动实现`Send`和`Sync`属于unsafe, 通常只是直接将已经是`Send`或`Sync`进行组合

## marker trait
表示这些trait并没有方法需要实现，只是提供给编译器一个对于某个事件的标记（约定）

## ch16-04 quizz

```rust
struct DbConnection {/* ... */ } 
impl DbConnection {     
	fn query(&self) -> DbResult {         /* ... */     } 
}
```
当实现的数据库中并不支持同一个连接的并发查询时，该`DbConnection`需要实现的trait只有`Send`
